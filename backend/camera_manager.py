"""
camera_manager.py  —  Single-model inference queue architecture

Performance fixes for 4+ camera stability:
- infer_every read from per-camera cfg (slider now works)
- Annotate on RESIZED frame (not full-res) — major CPU/memory saving
- Result queues capped at 2 — more aggressive drop, prevents backup
- JPEG encoding stays in thread pool
- Frame dedup hash — stream endpoint skips unchanged frames
"""

from __future__ import annotations

import hashlib
import math
import queue
import threading
import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
MAX_CAMERAS      = 5
INFER_WIDTH      = 480      # reduced from 640 — less GPU work, still accurate
ANNOTATE_WIDTH   = 640      # annotate at this width (downscaled from source)
JPEG_QUALITY     = 60
CONF             = 0.28   # lower threshold for better recall on overhead/distant shots
CLASSES          = [0]
RECONNECT_DELAY  = 2.0

_infer_queue: queue.Queue = queue.Queue(maxsize=MAX_CAMERAS * 3)

_result_queues: dict[str, queue.Queue]     = {}
_latest_frames: dict[str, bytes | None]   = {}
_latest_hashes: dict[str, bytes]          = {}   # for dedup in stream endpoint
_frame_locks:   dict[str, threading.Lock] = {}
_reader_stop:    dict[str, threading.Event] = {}
_annotator_stop: dict[str, threading.Event] = {}
_registry_lock = threading.Lock()

_jpeg_pool = ThreadPoolExecutor(max_workers=MAX_CAMERAS, thread_name_prefix="jpeg")

# ── YOLO model ─────────────────────────────────────────────────────────────────
_model            = None
_model_lock       = threading.Lock()
_device: str      = "cuda" if torch.cuda.is_available() else "cpu"
_infer_started    = False
_infer_start_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                print(f"[camera_manager] Loading YOLOv8s on {_device} imgsz={INFER_WIDTH}...")
                _model = YOLO("yolov8s")
                try:
                    _model.fuse()
                except Exception:
                    pass
                print("[camera_manager] Model ready.")
    return _model


# ── Centroid tracker ───────────────────────────────────────────────────────────

class _CentroidTracker:
    def __init__(self, max_lost: int = 15):
        self.next_id  = 1
        self.objects: dict[int, np.ndarray] = {}
        self.lost:    dict[int, int]         = {}
        self.max_lost = max_lost

    def update(self, boxes: list) -> list:
        if not boxes:
            for tid in list(self.lost):
                self.lost[tid] += 1
                if self.lost[tid] > self.max_lost:
                    del self.objects[tid]
                    del self.lost[tid]
            return []

        new_c = np.array(
            [[(x1+x2)/2, (y1+y2)/2, x2-x1, y2-y1] for x1,y1,x2,y2 in boxes],
            dtype=float
        )

        if not self.objects:
            result = []
            for i, (x1,y1,x2,y2) in enumerate(boxes):
                tid = self.next_id; self.next_id += 1
                self.objects[tid] = new_c[i]; self.lost[tid] = 0
                result.append((x1,y1,x2,y2,tid))
            return result

        obj_ids = list(self.objects.keys())
        obj_c   = np.array([self.objects[t] for t in obj_ids])

        cost = np.zeros((len(obj_ids), len(new_c)))
        for i, oc in enumerate(obj_c):
            for j, nc in enumerate(new_c):
                d     = math.hypot(oc[0]-nc[0], oc[1]-nc[1])
                avg_h = max(1, (oc[3]+nc[3])/2)
                cost[i,j] = d / avg_h

        matched_o: set[int] = set()
        matched_n: set[int] = set()
        pairs: list = []
        for oi, ni in sorted(np.ndindex(cost.shape), key=lambda ij: cost[ij]):
            if oi in matched_o or ni in matched_n:
                continue
            if cost[oi, ni] < 1.5:
                pairs.append((oi, ni))
                matched_o.add(oi); matched_n.add(ni)

        result = []
        for oi, ni in pairs:
            tid = obj_ids[oi]
            self.objects[tid] = new_c[ni]; self.lost[tid] = 0
            x1,y1,x2,y2 = boxes[ni]
            result.append((x1,y1,x2,y2,tid))

        for oi, tid in enumerate(obj_ids):
            if oi not in matched_o:
                self.lost[tid] = self.lost.get(tid,0) + 1
                if self.lost[tid] > self.max_lost:
                    del self.objects[tid]; del self.lost[tid]

        for ni, box in enumerate(boxes):
            if ni not in matched_n:
                tid = self.next_id; self.next_id += 1
                x1,y1,x2,y2 = box
                self.objects[tid] = new_c[ni]; self.lost[tid] = 0
                result.append((x1,y1,x2,y2,tid))

        return result


# ── Spatial helpers ────────────────────────────────────────────────────────────

def _side_of_line(p, a, b):
    return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])

def _point_in_polygon(point, polygon):
    x, y = point; inside = False
    px, py = polygon[0]
    for i in range(1, len(polygon)+1):
        qx, qy = polygon[i % len(polygon)]
        if min(py,qy) < y <= max(py,qy) and x <= max(px,qx):
            xi = (y-py)*(qx-px)/(qy-py)+px if qy != py else px
            if px == qx or x <= xi:
                inside = not inside
        px, py = qx, qy
    return inside


# ── Inference thread ───────────────────────────────────────────────────────────

def _inference_thread_fn():
    model = _get_model()
    print("[InferenceThread] running")
    while True:
        try:
            item = _infer_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        if item is None:
            break

        camera_id, infer_frame, ann_frame, scale_ann, cfg = item
        try:
            results = model.predict(
                infer_frame,
                classes=CLASSES,
                conf=CONF,
                iou=0.50,    # standard NMS IoU
                device=_device,
                imgsz=INFER_WIDTH,
                verbose=False,
            )
        except Exception as exc:
            print(f"[InferenceThread] error: {exc}")
            results = []

        rq = _result_queues.get(camera_id)
        if rq is not None:
            if rq.full():
                try: rq.get_nowait()
                except queue.Empty: pass
            try: rq.put_nowait((ann_frame, scale_ann, results, cfg))
            except queue.Full: pass

        _infer_queue.task_done()


def _ensure_infer_thread():
    global _infer_started
    with _infer_start_lock:
        if not _infer_started:
            threading.Thread(
                target=_inference_thread_fn,
                name="infer-thread", daemon=True
            ).start()
            _infer_started = True


# ── Frame reader thread ────────────────────────────────────────────────────────

def _reader_thread_fn(camera_id: str, cfg: dict, stop: threading.Event):
    video       = cfg.get("video", 0)
    infer_every = max(1, int(cfg.get("infer_every", 3)))

    print(f"[Reader:{camera_id[:8]}] opening {video}  infer_every={infer_every}")

    while not stop.is_set():
        cap = cv2.VideoCapture(video if isinstance(video, int) else str(video))
        if not cap.isOpened():
            print(f"[Reader:{camera_id[:8]}] cannot open, retry in {RECONNECT_DELAY}s")
            time.sleep(RECONNECT_DELAY)
            continue

        fps         = cap.get(cv2.CAP_PROP_FPS) or 25
        frame_t     = 1.0 / fps
        frame_count = 0
        wall_start  = time.perf_counter()
        frame_base  = 0

        while not stop.is_set():
            frame_count += 1
            ret, frame = cap.read()
            if not ret:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                wall_start = time.perf_counter()
                frame_base = frame_count
                continue

            elapsed = frame_count - frame_base
            target  = wall_start + elapsed * frame_t
            sleep_n = target - time.perf_counter()
            if sleep_n > 0:
                time.sleep(sleep_n)
            elif sleep_n < -(frame_t * 2):
                cap.grab(); frame_count += 1

            if frame_count % infer_every == 0:
                h, w = frame.shape[:2]

                # Annotation frame — downscale to ANNOTATE_WIDTH to save CPU
                ann_scale = ANNOTATE_WIDTH / w
                ann_frame = cv2.resize(frame, (ANNOTATE_WIDTH, int(h * ann_scale)))

                # Inference frame — further downscale to INFER_WIDTH
                inf_scale = INFER_WIDTH / ANNOTATE_WIDTH
                inf_frame = cv2.resize(ann_frame, (INFER_WIDTH, int(ann_frame.shape[0] * inf_scale)))

                try:
                    _infer_queue.put_nowait(
                        (camera_id, inf_frame, ann_frame, ann_scale, cfg)
                    )
                except queue.Full:
                    pass

        cap.release()
        if not stop.is_set():
            time.sleep(RECONNECT_DELAY)

    print(f"[Reader:{camera_id[:8]}] exited")


# ── JPEG encode + store ────────────────────────────────────────────────────────

def _encode_and_store(frame: np.ndarray, camera_id: str, lk: threading.Lock):
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if ok:
        b = buf.tobytes()
        with lk:
            _latest_frames[camera_id] = b
            _latest_hashes[camera_id] = hashlib.md5(b).digest()


# ── Annotator thread ───────────────────────────────────────────────────────────

def _annotator_thread_fn(camera_id: str, scenario: str, cfg: dict,
                         stop: threading.Event):
    line             = cfg.get("line")
    restricted_point = cfg.get("restricted_point")
    zone             = cfg.get("zone", [])
    fps              = float(cfg.get("fps", 25))

    a = b = r_sign = None
    if line and restricted_point:
        a = tuple(line[0]); b = tuple(line[1])
        r_sign = _side_of_line(tuple(restricted_point), a, b)

    tracker    = _CentroidTracker(max_lost=int(fps * 1.5))  # survive ~1.5s gap (loop boundary)
    cross_buf  = defaultdict(int)
    zone_buf   = defaultdict(int)

    # ── Behaviour tuning ──────────────────────────────────────────────────────
    EMA_A        = 0.10   # very slow smoothing — dampens spikes
    # Running: must sustain fast movement for ~1.5 seconds AND travel real distance
    CONFIRM      = int(fps * 1.5)
    MIN_SPD      = float(cfg.get("min_running_speed", 4.0))   # raised — walking tops ~2.5
    MIN_DIST     = float(cfg.get("min_distance", 4.0))
    WALK_SPD     = MIN_SPD * 0.55   # walking band
    RUN_EXIT_SPD = MIN_SPD * 0.45   # hysteresis — must slow down a lot to exit RUN
    # Speed spike filter: ignore any single-frame speed > this multiple of current EMA
    SPIKE_MULT   = 4.0
    LOITER_TIME  = float(cfg.get("loiter_time", 10))
    LOITER_RAD   = float(cfg.get("loiter_radius", 0.8))   # relaxed — groups have spread
    IDLE, WALK, POS, RUN = 0, 1, 2, 3

    t_hist      = defaultdict(lambda: deque(maxlen=int(fps * 30)))  # 30s of history
    ema_spd     = defaultdict(float)
    dist_bl     = defaultdict(float)
    r_state     = defaultdict(lambda: IDLE)
    r_cnt       = defaultdict(int)
    loitering   = defaultdict(bool)
    # Wall-clock loiter start — survives video loops
    loiter_wall_start: dict[int, float] = {}
    loiter_total_secs: dict[int, float] = defaultdict(float)

    rq = _result_queues[camera_id]
    lk = _frame_locks[camera_id]

    zone_pts_np = np.array(zone, dtype=np.int32) if len(zone) >= 3 else None

    # Scaled zone list (computed once)
    scaled_zone_list: list = []

    while not stop.is_set():
        try:
            item = rq.get(timeout=0.5)
        except queue.Empty:
            continue

        ann_frame, ann_scale, results, _ = item

        infer_to_ann = ANNOTATE_WIDTH / INFER_WIDTH

        boxes_raw = []
        for r in results:
            if not hasattr(r, 'boxes') or r.boxes is None:
                continue
            for box in r.boxes.xyxy:
                x1,y1,x2,y2 = map(int, box)
                x1=int(x1*infer_to_ann); x2=int(x2*infer_to_ann)
                y1=int(y1*infer_to_ann); y2=int(y2*infer_to_ann)
                boxes_raw.append((x1,y1,x2,y2))

        tracked = tracker.update(boxes_raw)

        def sc(v):
            return int(v * ann_scale)

        if scenario == "metro_line" and a and b:
            pa = (sc(a[0]), sc(a[1]))
            pb = (sc(b[0]), sc(b[1]))
            cv2.line(ann_frame, pa, pb, (0,255,255), 1)

        if scenario == "zone_detection" and zone_pts_np is not None:
            if not scaled_zone_list:
                scaled_zone_list = [(int(p[0]*ann_scale), int(p[1]*ann_scale)) for p in zone]
            sz = (zone_pts_np * ann_scale).astype(np.int32)
            ov = ann_frame.copy()
            cv2.fillPoly(ov, [sz], (0,0,180))
            cv2.addWeighted(ov, 0.18, ann_frame, 0.82, 0, ann_frame)
            cv2.polylines(ann_frame, [sz], True, (0,0,255), 1)
            cv2.putText(ann_frame, "RESTRICTED ZONE", tuple(sz[0]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,0,255), 1)

        now_wall = time.time()

        for (x1,y1,x2,y2,tid) in tracked:
            cx    = (x1+x2)//2
            cy    = y2
            box_h = max(1, y2-y1)

            if scenario == "metro_line" and a and b:
                pa = (sc(a[0]), sc(a[1]))
                pb = (sc(b[0]), sc(b[1]))
                pr = (sc(restricted_point[0]), sc(restricted_point[1]))
                r_sign_s = _side_of_line(pr, pa, pb)
                sign  = _side_of_line((cx,cy), pa, pb)
                if r_sign_s and sign * r_sign_s > 0:
                    cross_buf[tid] += 1
                else:
                    cross_buf[tid]  = 0
                alert = cross_buf[tid] >= 3
                color = (0,0,255) if alert else (0,255,0)
                label = f"#{tid} ALERT" if alert else f"#{tid}"

            elif scenario == "zone_detection" and zone_pts_np is not None:
                if not scaled_zone_list:
                    scaled_zone_list = [(int(p[0]*ann_scale), int(p[1]*ann_scale)) for p in zone]
                if _point_in_polygon((cx,cy), scaled_zone_list):
                    zone_buf[tid] += 1
                else:
                    zone_buf[tid]  = 0
                alert = zone_buf[tid] >= 3
                color = (0,0,255) if alert else (0,255,0)
                label = f"#{tid} ALERT" if alert else f"#{tid}"

            else:
                # ── Behaviour detection ──────────────────────────────────────
                t_hist[tid].append((cx, cy, box_h, now_wall))

                spd = 0.0
                if len(t_hist[tid]) >= 2:
                    px,py,ph,_ = t_hist[tid][-2]
                    d     = math.hypot(cx-px, cy-py)
                    avg_h = max(1,(box_h+ph)/2)
                    raw_spd = (d/avg_h) * fps

                    # Spike filter: ignore implausible jumps (tracker ID switch,
                    # momentary YOLO miss, or occlusion pop)
                    cur_ema = ema_spd[tid]
                    if cur_ema > 0.5 and raw_spd > cur_ema * SPIKE_MULT:
                        raw_spd = cur_ema  # clamp to current estimate

                    spd = raw_spd
                    dist_bl[tid] += d/avg_h

                ema_spd[tid] = EMA_A*spd + (1-EMA_A)*ema_spd[tid]
                s = ema_spd[tid]

                # ── Running state machine ────────────────────────────────────
                if r_state[tid] == IDLE:
                    if s > WALK_SPD:
                        r_state[tid] = WALK
                elif r_state[tid] == WALK:
                    if s < WALK_SPD * 0.7:
                        r_state[tid] = IDLE
                    elif s > MIN_SPD:
                        r_state[tid] = POS; r_cnt[tid] = 1; dist_bl[tid] = 0.0
                elif r_state[tid] == POS:
                    if s > MIN_SPD:
                        r_cnt[tid] += 1
                        # dist_bl already accumulates above from d/avg_h
                    else:
                        r_state[tid] = WALK; r_cnt[tid] = 0; dist_bl[tid] = 0.0
                    if r_cnt[tid] >= CONFIRM and dist_bl[tid] >= MIN_DIST:
                        r_state[tid] = RUN
                elif r_state[tid] == RUN:
                    if s < RUN_EXIT_SPD:
                        r_state[tid] = WALK; r_cnt[tid] = 0; dist_bl[tid] = 0.0

                # ── Loitering — wall-clock based, survives video loops ────────
                history = list(t_hist[tid])
                cutoff  = now_wall - LOITER_TIME
                recent  = [(x,y,h) for x,y,h,t in history if t >= cutoff]
                all_pts = [(x,y,h) for x,y,h,t in history]

                # Only need at least 3 seconds of history to start evaluating
                three_sec_ago = now_wall - 3.0
                early = [(x,y,h) for x,y,h,t in history if t >= three_sec_ago]

                if len(early) >= max(3, int(fps * 1.0)):
                    # Use median position to be robust against group-merge jitter
                    xs_e  = sorted([p[0] for p in early])
                    ys_e  = sorted([p[1] for p in early])
                    med_x = xs_e[len(xs_e)//2]
                    med_y = ys_e[len(ys_e)//2]
                    ah2   = max(1, np.mean([p[2] for p in early]))
                    # Spread = max deviation from median in body-lengths
                    spr = max(
                        max(abs(p[0]-med_x) for p in early) / ah2,
                        max(abs(p[1]-med_y) for p in early) / ah2
                    )
                    if spr < LOITER_RAD:
                        if tid not in loiter_wall_start:
                            loiter_wall_start[tid] = now_wall - 3.0  # credit 3s already observed
                        elapsed = now_wall - loiter_wall_start[tid]
                        if elapsed >= LOITER_TIME:
                            loitering[tid] = True
                    else:
                        loiter_wall_start.pop(tid, None)
                        loitering[tid] = False
                else:
                    loiter_wall_start.pop(tid, None)
                    loitering[tid] = False

                # ── Label ────────────────────────────────────────────────────
                if r_state[tid] == RUN:
                    color = (0,0,255)
                    label = f"#{tid} RUNNING"
                elif loitering[tid]:
                    elapsed = now_wall - loiter_wall_start.get(tid, now_wall)
                    color = (0,100,255)
                    label = f"#{tid} LOITERING {int(elapsed)}s"
                elif r_state[tid] in (POS, WALK):
                    color = (0,200,0)
                    label = f"#{tid} WALKING"
                else:
                    color = (0,255,0)
                    label = f"#{tid}"

            cv2.rectangle(ann_frame,(x1,y1),(x2,y2),color,1)
            cv2.putText(ann_frame,label,(x1,max(10,y1-6)),
                        cv2.FONT_HERSHEY_SIMPLEX,0.45,color,1)
            cv2.circle(ann_frame,(cx,cy),3,color,-1)

        _jpeg_pool.submit(_encode_and_store, ann_frame, camera_id, lk)

    print(f"[Annotator:{camera_id[:8]}] exited")


# ── Public API ─────────────────────────────────────────────────────────────────

def start(camera_id: str, scenario: str, cfg: dict) -> None:
    _ensure_infer_thread()

    with _registry_lock:
        _stop_locked(camera_id)

        alive = sum(1 for ev in _reader_stop.values() if not ev.is_set())
        if alive >= MAX_CAMERAS:
            raise ValueError(f"Maximum simultaneous cameras ({MAX_CAMERAS}) reached.")

        video = cfg.get("video", 0)
        try:
            cap = cv2.VideoCapture(video if isinstance(video,int) else str(video))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25
            cap.release()
        except Exception:
            fps = 25
        cfg = dict(cfg, fps=fps)

        sr = threading.Event(); sa = threading.Event()
        _result_queues[camera_id] = queue.Queue(maxsize=2)   # cap at 2 — drop aggressively
        _latest_frames[camera_id] = None
        _latest_hashes[camera_id] = b""
        _frame_locks[camera_id]   = threading.Lock()
        _reader_stop[camera_id]   = sr
        _annotator_stop[camera_id]= sa

    threading.Thread(target=_reader_thread_fn,
                     args=(camera_id, cfg, sr),
                     name=f"reader-{camera_id}", daemon=True).start()
    threading.Thread(target=_annotator_thread_fn,
                     args=(camera_id, scenario, cfg, sa),
                     name=f"annotator-{camera_id}", daemon=True).start()

    print(f"[camera_manager] started {camera_id[:16]} ({scenario})")


def _stop_locked(camera_id: str):
    for d in (_reader_stop, _annotator_stop, _result_queues,
              _latest_frames, _frame_locks, _latest_hashes):
        d.pop(camera_id, None)


def stop(camera_id: str) -> bool:
    with _registry_lock:
        if camera_id not in _reader_stop:
            return False
        _reader_stop[camera_id].set()
        _annotator_stop[camera_id].set()
        _stop_locked(camera_id)
    print(f"[camera_manager] stopped {camera_id[:16]}")
    return True


def stop_all():
    with _registry_lock:
        ids = list(_reader_stop.keys())
    for cid in ids:
        stop(cid)


def get_frame(camera_id: str) -> bytes | None:
    lk = _frame_locks.get(camera_id)
    if lk is None: return None
    with lk:
        return _latest_frames.get(camera_id)


def get_frame_hash(camera_id: str) -> bytes:
    lk = _frame_locks.get(camera_id)
    if lk is None: return b""
    with lk:
        return _latest_hashes.get(camera_id, b"")


def status() -> list[dict]:
    with _registry_lock:
        return [
            {"camera_id": cid, "alive": not ev.is_set(),
             "has_frame": bool(_latest_frames.get(cid))}
            for cid, ev in _reader_stop.items()
        ]

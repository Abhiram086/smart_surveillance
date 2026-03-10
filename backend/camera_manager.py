"""
camera_manager.py  —  Single-model inference queue architecture
----------------------------------------------------------------

Architecture:
  ┌─────────────────────────────────────────────────────────────┐
  │  FrameReader threads (one per camera)                        │
  │    • read frames from cv2.VideoCapture                       │
  │    • apply FPS lock                                          │
  │    • push every Nth frame → shared infer_queue               │
  │                                                             │
  │  InferenceThread (ONE, shared)                               │
  │    • owns the SINGLE YOLO model instance                     │
  │    • pops items from infer_queue one at a time               │
  │    • runs model.predict() (no persist — avoids ID mixing)    │
  │    • pushes results → per-camera result_queues               │
  │                                                             │
  │  AnnotatorThread (one per camera)                            │
  │    • pops from its result_queue                              │
  │    • runs spatial logic + centroid tracker                   │
  │    • draws boxes, labels, overlays                           │
  │    • writes JPEG → latest_frame[camera_id]                   │
  │                                                             │
  │  /cameras/stream/{id}  endpoint                              │
  │    • reads latest_frame[camera_id] in an async drain loop    │
  └─────────────────────────────────────────────────────────────┘

All GPU calls are serialised through ONE thread → no CUDA contention.
3 cameras = 3 readers + 1 shared inference thread + 3 annotators.
"""

from __future__ import annotations

import math
import queue
import threading
import time
from collections import defaultdict, deque
from typing import Any

import cv2
import numpy as np
import torch
from ultralytics import YOLO

# ── Config ─────────────────────────────────────────────────────────────────────
MAX_CAMERAS    = 5
INFER_EVERY    = 3       # run YOLO on every Nth frame; display all frames
INFER_WIDTH    = 640
JPEG_QUALITY   = 75
CONF           = 0.35
CLASSES        = [0]     # person only
RECONNECT_DELAY = 2.0

# Shared inference queue (bounded so stale frames are dropped, not queued)
_infer_queue: queue.Queue = queue.Queue(maxsize=MAX_CAMERAS * 2)

# Per-camera result queues + frame stores
_result_queues: dict[str, queue.Queue]     = {}
_latest_frames: dict[str, bytes | None]   = {}
_frame_locks:   dict[str, threading.Lock] = {}

# Thread stop events
_reader_stop:    dict[str, threading.Event] = {}
_annotator_stop: dict[str, threading.Event] = {}
_registry_lock = threading.Lock()

# ── YOLO model (loaded once on first camera start) ─────────────────────────────
_model: YOLO | None   = None
_model_lock           = threading.Lock()
_device: str          = "cuda" if torch.cuda.is_available() else "cpu"
_infer_started        = False
_infer_start_lock     = threading.Lock()


def _get_model() -> YOLO:
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                print(f"[InferenceThread] Loading YOLOv8s on {_device}...")
                _model = YOLO("yolov8s")
                try:
                    _model.fuse()
                except Exception:
                    pass
                print(f"[InferenceThread] Model ready.")
    return _model


# ── Simple centroid tracker (per camera, independent) ──────────────────────────

class _CentroidTracker:
    def __init__(self, max_lost: int = 15):
        self.next_id  = 1
        self.objects: dict[int, np.ndarray] = {}
        self.lost:    dict[int, int]         = {}
        self.max_lost = max_lost

    def update(self, boxes: list) -> list:
        """boxes: [(x1,y1,x2,y2), ...] → [(x1,y1,x2,y2,tid), ...]"""
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

        # Greedy distance-based match
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


# ── Inference thread (singleton) ───────────────────────────────────────────────

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

        camera_id, infer_frame, scale, frame_orig, cfg = item
        try:
            results = model.predict(
                infer_frame,
                classes=CLASSES,
                conf=CONF,
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
            try: rq.put_nowait((frame_orig, scale, results, cfg))
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
    video = cfg.get("video", 0)
    print(f"[Reader:{camera_id[:8]}] opening {video}")

    while not stop.is_set():
        cap = cv2.VideoCapture(video if isinstance(video,int) else str(video))
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
                wall_start  = time.perf_counter()
                frame_base  = frame_count
                continue

            # FPS lock
            elapsed      = frame_count - frame_base
            target       = wall_start + elapsed * frame_t
            sleep_n      = target - time.perf_counter()
            if sleep_n > 0:
                time.sleep(sleep_n)
            elif sleep_n < -(frame_t * 2):
                cap.grab(); frame_count += 1

            # Push every Nth frame to inference queue
            if frame_count % INFER_EVERY == 0:
                h, w      = frame.shape[:2]
                scale     = INFER_WIDTH / w
                inf_frame = cv2.resize(frame, (INFER_WIDTH, int(h*scale)))
                try:
                    _infer_queue.put_nowait(
                        (camera_id, inf_frame, scale, frame.copy(), cfg)
                    )
                except queue.Full:
                    pass  # inference thread busy — drop, don't stall reader

        cap.release()
        if not stop.is_set():
            time.sleep(RECONNECT_DELAY)

    print(f"[Reader:{camera_id[:8]}] exited")


# ── Annotator thread ────────────────────────────────────────────────────────────

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

    tracker     = _CentroidTracker()
    cross_buf   = defaultdict(int)
    zone_buf    = defaultdict(int)

    # Behaviour state
    EMA_A          = 0.15
    CONFIRM        = 12
    MIN_SPD        = float(cfg.get("min_running_speed", 2.5))
    MIN_DIST       = float(cfg.get("min_distance", 2.0))
    LOITER_TIME    = float(cfg.get("loiter_time", 10))
    LOITER_RAD     = float(cfg.get("loiter_radius", 0.6))
    IDLE, POS, RUN = 0, 1, 2

    t_hist     = defaultdict(lambda: deque(maxlen=300))
    ema_spd    = defaultdict(float)
    dist_bl    = defaultdict(float)
    r_state    = defaultdict(lambda: IDLE)
    r_cnt      = defaultdict(int)
    loitering  = defaultdict(bool)
    loiter_f   = defaultdict(lambda: None)
    frame_n    = 0

    rq = _result_queues[camera_id]

    while not stop.is_set():
        try:
            item = rq.get(timeout=0.5)
        except queue.Empty:
            continue

        frame, scale, results, _ = item
        frame_n += 1

        # Parse detections
        boxes_raw = []
        for r in results:
            if not hasattr(r, 'boxes') or r.boxes is None:
                continue
            for box in r.boxes.xyxy:
                x1,y1,x2,y2 = map(int, box)
                x1=int(x1/scale); x2=int(x2/scale)
                y1=int(y1/scale); y2=int(y2/scale)
                boxes_raw.append((x1,y1,x2,y2))

        tracked = tracker.update(boxes_raw)

        # Scenario-level drawing
        if scenario == "metro_line" and a and b:
            cv2.line(frame, a, b, (0,255,255), 2)

        if scenario == "zone_detection" and len(zone) >= 3:
            pts = np.array(zone, dtype=np.int32)
            ov  = frame.copy()
            cv2.fillPoly(ov, [pts], (0,0,180))
            cv2.addWeighted(ov, 0.20, frame, 0.80, 0, frame)
            cv2.polylines(frame, [pts], True, (0,0,255), 2)
            cv2.putText(frame, "RESTRICTED ZONE", tuple(zone[0]),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

        for (x1,y1,x2,y2,tid) in tracked:
            cx    = (x1+x2)//2
            cy    = y2
            box_h = max(1, y2-y1)

            if scenario == "metro_line" and a and b:
                sign = _side_of_line((cx,cy), a, b)
                if r_sign and sign * r_sign > 0:
                    cross_buf[tid] += 1
                else:
                    cross_buf[tid]  = 0
                alert = cross_buf[tid] >= 3
                color = (0,0,255) if alert else (0,255,0)
                label = f"ID {tid} - RESTRICTED" if alert else f"ID {tid}"

            elif scenario == "zone_detection" and len(zone) >= 3:
                if _point_in_polygon((cx,cy), zone):
                    zone_buf[tid] += 1
                else:
                    zone_buf[tid]  = 0
                alert = zone_buf[tid] >= 3
                color = (0,0,255) if alert else (0,255,0)
                label = f"ID {tid} - RESTRICTED" if alert else f"ID {tid}"

            else:  # behavior
                t_hist[tid].append((cx,cy,box_h))
                spd = 0.0
                if len(t_hist[tid]) >= 2:
                    px,py,ph = t_hist[tid][-2]
                    d     = math.hypot(cx-px, cy-py)
                    avg_h = max(1,(box_h+ph)/2)
                    spd   = (d/avg_h) * fps
                    dist_bl[tid] += d/avg_h

                ema_spd[tid] = EMA_A*spd + (1-EMA_A)*ema_spd[tid]
                s = ema_spd[tid]

                if r_state[tid] == IDLE:
                    if s > MIN_SPD:
                        r_state[tid]=POS; r_cnt[tid]=1; dist_bl[tid]=0.0
                elif r_state[tid] == POS:
                    if s > MIN_SPD: r_cnt[tid]+=1
                    else: r_state[tid]=IDLE; r_cnt[tid]=0; dist_bl[tid]=0.0
                    if r_cnt[tid] >= CONFIRM and dist_bl[tid] >= MIN_DIST:
                        r_state[tid] = RUN
                elif r_state[tid] == RUN:
                    if s < MIN_SPD*0.55:
                        r_state[tid]=IDLE; r_cnt[tid]=0; dist_bl[tid]=0.0

                req = int(fps * LOITER_TIME)
                if len(t_hist[tid]) >= req:
                    pts_l = list(t_hist[tid])[-req:]
                    ah2   = max(1, np.mean([p[2] for p in pts_l]))
                    xs    = [p[0] for p in pts_l]
                    ys    = [p[1] for p in pts_l]
                    spr   = math.hypot((max(xs)-min(xs))/ah2,
                                       (max(ys)-min(ys))/ah2)
                    if spr < LOITER_RAD:
                        if loiter_f[tid] is None: loiter_f[tid] = frame_n
                        if frame_n - loiter_f[tid] > fps * LOITER_TIME:
                            loitering[tid] = True
                    else:
                        loiter_f[tid] = None; loitering[tid] = False

                if r_state[tid] == RUN:
                    color=(0,0,255); label=f"RUNNING  {s:.1f} bl/s"
                elif loitering[tid]:
                    color=(255,0,0); label="LOITERING"
                else:
                    color=(0,255,0); label=f"ID {tid}  {s:.1f} bl/s"

            cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
            cv2.putText(frame,label,(x1,y1-10),
                        cv2.FONT_HERSHEY_SIMPLEX,0.6,color,2)
            cv2.circle(frame,(cx,cy),4,color,-1)

        # Encode JPEG
        ok, buf = cv2.imencode(".jpg", frame,
                               [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if ok:
            lk = _frame_locks.get(camera_id)
            if lk:
                with lk:
                    _latest_frames[camera_id] = buf.tobytes()

    print(f"[Annotator:{camera_id[:8]}] exited")


# ── Public API ─────────────────────────────────────────────────────────────────

def start(camera_id: str, scenario: str, cfg: dict) -> None:
    _ensure_infer_thread()

    with _registry_lock:
        _stop_locked(camera_id)

        alive = sum(1 for ev in _reader_stop.values() if not ev.is_set())
        if alive >= MAX_CAMERAS:
            raise ValueError(f"Maximum simultaneous cameras ({MAX_CAMERAS}) reached.")

        # Fetch FPS from source for annotator speed math
        video = cfg.get("video", 0)
        try:
            cap = cv2.VideoCapture(video if isinstance(video,int) else str(video))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25
            cap.release()
        except Exception:
            fps = 25
        cfg = dict(cfg, fps=fps)

        sr = threading.Event(); sa = threading.Event()
        _result_queues[camera_id] = queue.Queue(maxsize=4)
        _latest_frames[camera_id] = None
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
              _latest_frames, _frame_locks):
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


def status() -> list[dict]:
    with _registry_lock:
        return [
            {"camera_id": cid, "alive": not ev.is_set(),
             "has_frame": bool(_latest_frames.get(cid))}
            for cid, ev in _reader_stop.items()
        ]
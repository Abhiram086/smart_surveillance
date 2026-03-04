import cv2
import time
from ultralytics import YOLO
from collections import defaultdict
import torch


def side_of_line(p, a, b):
    """Return signed value indicating which side of line AB point P is on."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def run(video, cfg, stream=False):

    line             = cfg.get("line")
    restricted_point = cfg.get("restricted_point")

    if line is None or restricted_point is None:
        raise ValueError("Line configuration missing")

    a = tuple(line[0])
    b = tuple(line[1])
    restricted_sign = side_of_line(tuple(restricted_point), a, b)

    # ── DEVICE ────────────────────────────────────────────────────────────────
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    # ── MODEL ─────────────────────────────────────────────────────────────────
    model = YOLO("yolov8s")
    try:
        model.fuse()
    except Exception:
        pass

    # ── VIDEO ─────────────────────────────────────────────────────────────────
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if fps > 0 else 25
    frame_time = 1.0 / fps

    print(f"[INFO] Video FPS: {fps:.1f}  target frame_time: {frame_time*1000:.1f} ms")

    INFER_WIDTH          = 640
    CROSS_CONFIRM_FRAMES = 3   # consecutive frames to confirm a crossing

    # per-track crossing confirmation buffer
    cross_buffer = defaultdict(int)

    # ── PLAYBACK CLOCK ────────────────────────────────────────────────────────
    playback_start_wall  = time.perf_counter()
    playback_start_frame = 0
    frame_count          = 0

    # ── MAIN LOOP ─────────────────────────────────────────────────────────────
    while True:
        frame_count += 1

        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            playback_start_wall  = time.perf_counter()
            playback_start_frame = frame_count
            continue

        # ── FPS LOCK ──────────────────────────────────────────────────────────
        frames_since_start = frame_count - playback_start_frame
        target_wall_time   = playback_start_wall + frames_since_start * frame_time
        now                = time.perf_counter()
        sleep_needed       = target_wall_time - now

        if sleep_needed > 0:
            # processed faster than real-time — wait
            time.sleep(sleep_needed)
        elif sleep_needed < -(frame_time * 2):
            # more than 2 frames behind — skip one to reduce lag
            cap.grab()
            frame_count += 1

        # ── INFERENCE ─────────────────────────────────────────────────────────
        h, w        = frame.shape[:2]
        scale       = INFER_WIDTH / w
        infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * scale)))

        results = model.track(
            infer_frame,
            persist=True,
            classes=[0],
            conf=0.35,
            device=DEVICE,
            imgsz=INFER_WIDTH,
            verbose=False,
        )

        # draw safety line on original frame
        cv2.line(frame, a, b, (0, 255, 255), 2)

        for r in results:
            if r.boxes.id is None:
                continue

            for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                x1, y1, x2, y2 = map(int, box)
                # scale back to original frame dimensions
                x1 = int(x1 / scale);  x2 = int(x2 / scale)
                y1 = int(y1 / scale);  y2 = int(y2 / scale)

                tid = int(tid)

                # foot-point — more accurate crossing trigger than center
                cx = (x1 + x2) // 2
                cy = y2

                person_sign = side_of_line((cx, cy), a, b)

                # ── CROSSING CONFIRMATION BUFFER ──────────────────────────
                if person_sign * restricted_sign > 0:
                    cross_buffer[tid] += 1
                else:
                    cross_buffer[tid] = 0

                is_restricted = cross_buffer[tid] >= CROSS_CONFIRM_FRAMES

                # ── DRAW ──────────────────────────────────────────────────
                if is_restricted:
                    color = (0, 0, 255)
                    label = f"ID {tid} - RESTRICTED"
                else:
                    color = (0, 255, 0)
                    label = f"ID {tid}"

                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                cv2.putText(
                    frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2,
                )
                # foot-point dot
                cv2.circle(frame, (cx, cy), 4, color, -1)

        # ── STREAM OR LOCAL WINDOW ────────────────────────────────────────────
        if stream:
            yield frame
        else:
            cv2.imshow("Metro Safety Monitoring", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()
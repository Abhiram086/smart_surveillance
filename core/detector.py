import cv2
import time
from ultralytics import YOLO
from collections import defaultdict, deque
import math
import torch
import numpy as np
import sys
import os

# ──────────────────────────────────────────────────────────────
# FIX PYTHON PATH (so detector can access backend modules)
# ──────────────────────────────────────────────────────────────

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
sys.path.append(PROJECT_ROOT)

from backend.db.database import get_db_connection

# ──────────────────────────────────────────────────────────────
# DATABASE LOGGER
# ──────────────────────────────────────────────────────────────

last_logged_time = defaultdict(float)


def log_detection(camera_id, obj, confidence, tid):

    now = time.time()

    # prevent spamming database
    if now - last_logged_time[tid] < 2:
        return

    try:
        conn_gen = get_db_connection()
        conn = next(conn_gen)
        cur = conn.cursor()

        cur.execute(
            """
            INSERT INTO detections (camera_id, object_type, confidence)
            VALUES (%s, %s, %s)
            """,
            (camera_id, obj, confidence),
        )

        conn.commit()
        cur.close()

        # return connection to pool correctly
        try:
            next(conn_gen)
        except StopIteration:
            pass

        last_logged_time[tid] = now

    except Exception as e:
        print("DB logging error:", e)


# ──────────────────────────────────────────────────────────────
# MAIN DETECTOR
# ──────────────────────────────────────────────────────────────


def run_behavior(video_path, cfg, stream=False):

    CONFIDENCE = cfg.get("confidence", 0.35)
    INFER_WIDTH = 640
    INFER_EVERY = int(cfg.get("infer_every", 1))

    MIN_RUNNING_SPEED = cfg.get("min_running_speed", 2.5)
    MIN_DISTANCE_BL = cfg.get("min_distance", 2.0)

    LOITER_TIME = cfg.get("loiter_time", 10)
    LOITER_RADIUS = cfg.get("loiter_radius", 0.6)

    CONFIRM_FRAMES = 12
    EMA_ALPHA = 0.15

    IDLE, POSSIBLE, RUNNING = 0, 1, 2

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    model = YOLO("yolov8s")

    try:
        model.fuse()
    except Exception:
        pass

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print("[ERROR] Cannot open video source")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if fps > 0 else 25

    frame_time = 1.0 / fps
    video_spf = 1.0 / fps

    print(f"[INFO] Video FPS: {fps:.1f}")
    print("[INFO] Press Q or ESC to stop")

    track_history = defaultdict(lambda: deque(maxlen=int(fps * 15)))
    ema_speed_norm = defaultdict(float)
    prev_speed_norm = defaultdict(float)
    distance_bl = defaultdict(float)

    state = defaultdict(lambda: IDLE)
    state_counter = defaultdict(int)

    loiter_start_frame = defaultdict(lambda: None)
    is_loitering = defaultdict(lambda: False)

    frame_count = 0

    cached_boxes = []
    last_scale = 1.0

    def check_loitering(tid):

        history = track_history[tid]
        required = int(fps * LOITER_TIME)

        if len(history) < required:
            return False

        points = list(history)[-required:]

        avg_h = max(1, np.mean([p[2] for p in points]))

        xs = [p[0] for p in points]
        ys = [p[1] for p in points]

        dx = (max(xs) - min(xs)) / avg_h
        dy = (max(ys) - min(ys)) / avg_h

        return math.sqrt(dx * dx + dy * dy) < LOITER_RADIUS

    playback_start_wall = time.perf_counter()
    playback_start_frame = 0

    while True:

        frame_count += 1

        ret, frame = cap.read()

        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            playback_start_wall = time.perf_counter()
            playback_start_frame = frame_count
            continue

        h, w = frame.shape[:2]

        if frame_count % INFER_EVERY == 0:

            last_scale = INFER_WIDTH / w
            infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * last_scale)))

            results = model.track(
                infer_frame,
                persist=True,
                classes=[0],
                conf=CONFIDENCE,
                device=DEVICE,
                imgsz=INFER_WIDTH,
                verbose=False,
            )

            cached_boxes = []

            for r in results:

                if r.boxes.id is None:
                    continue

                for box, tid, conf in zip(r.boxes.xyxy, r.boxes.id, r.boxes.conf):

                    x1, y1, x2, y2 = map(int, box)

                    x1 = int(x1 / last_scale)
                    x2 = int(x2 / last_scale)
                    y1 = int(y1 / last_scale)
                    y2 = int(y2 / last_scale)

                    tid = int(tid)

                    cx = (x1 + x2) // 2
                    cy = y2
                    box_h = max(1, y2 - y1)

                    track_history[tid].append((cx, cy, box_h))

                    log_detection(
                        camera_id=1,
                        obj="person",
                        confidence=float(conf),
                        tid=tid
                    )

                    label = f"ID {tid}"
                    color = (0, 255, 0)

                    cached_boxes.append((x1, y1, x2, y2, color, label))

        for x1, y1, x2, y2, color, label in cached_boxes:

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            cv2.putText(
                frame,
                label,
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )

        cv2.putText(frame, "Press Q or ESC to exit", (20, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        if stream:
            yield frame

        else:

            cv2.imshow("Behavior Monitoring", frame)

            key = cv2.waitKey(1)

            if key == ord('q') or key == ord('Q') or key == 27:
                print("[INFO] Stopping detector...")
                break

    cap.release()
    cv2.destroyAllWindows()
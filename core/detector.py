import cv2
import time
from ultralytics import YOLO
from collections import defaultdict, deque
import math
import torch

def run_behavior(video_path, cfg, stream=False):

    CONFIDENCE = cfg.get("confidence", 0.01)
    INFER_WIDTH = 640

    MIN_RUNNING_SPEED = cfg.get("min_running_speed", 120)
    MIN_ACCELERATION = cfg.get("min_acceleration", 120)
    MIN_DISTANCE = cfg.get("min_distance", 100)

    POSSIBLE_FRAMES = 4
    RUNNING_FRAMES = 6
    EMA_ALPHA = 0.4

    IDLE, POSSIBLE, RUNNING = 0, 1, 2

    # -------- DEVICE AUTO SELECT --------
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    # -------- AUTO MODEL DOWNLOAD --------
    model = YOLO("yolov8n")

    try:
        model.fuse()
    except Exception:
        pass

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("ERROR: Cannot open video")
        return

    fps = cap.get(cv2.CAP_PROP_FPS)
    fps = fps if fps > 0 else 25
    frame_time = 1.0 / fps

    track_history = defaultdict(lambda: deque(maxlen=30))
    ema_speed = defaultdict(float)
    prev_ema_speed = defaultdict(float)
    ema_accel = defaultdict(float)
    distance_window = defaultdict(float)

    state = defaultdict(lambda: IDLE)
    state_counter = defaultdict(int)

    while True:
        start = time.time()

        ret, frame = cap.read()

        # LOOP VIDEO (important for demos)
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        h, w = frame.shape[:2]
        scale = INFER_WIDTH / w
        infer_frame = cv2.resize(frame, (INFER_WIDTH, int(h * scale)))

        results = model.track(
            infer_frame,
            persist=True,
            classes=[0],
            conf=CONFIDENCE,
            device=DEVICE,
            imgsz=INFER_WIDTH
        )

        for r in results:
            if r.boxes.id is None:
                continue

            for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                x1, y1, x2, y2 = map(int, box)

                # scale back to original frame
                x1, y1 = int(x1/scale), int(y1/scale)
                x2, y2 = int(x2/scale), int(y2/scale)

                tid = int(tid)
                cx, cy = (x1+x2)//2, (y1+y2)//2

                track_history[tid].append((cx, cy))

                speed = 0
                if len(track_history[tid]) >= 2:
                    px, py = track_history[tid][-2]
                    dist = math.hypot(cx-px, cy-py)
                    speed = dist / frame_time
                    distance_window[tid] += dist

                    prev_ema_speed[tid] = ema_speed[tid]
                    ema_speed[tid] = EMA_ALPHA*speed + (1-EMA_ALPHA)*ema_speed[tid]

                accel = abs(ema_speed[tid]-prev_ema_speed[tid]) / frame_time
                ema_accel[tid] = EMA_ALPHA*accel + (1-EMA_ALPHA)*ema_accel[tid]

                if state[tid] == IDLE and ema_speed[tid] > MIN_RUNNING_SPEED:
                    state[tid] = POSSIBLE
                    state_counter[tid] = 1
                    distance_window[tid] = 0

                elif state[tid] == POSSIBLE:
                    if ema_speed[tid] > MIN_RUNNING_SPEED and ema_accel[tid] > MIN_ACCELERATION:
                        state_counter[tid] += 1
                    else:
                        state[tid] = IDLE
                        state_counter[tid] = 0
                        distance_window[tid] = 0

                    if state_counter[tid] >= POSSIBLE_FRAMES and distance_window[tid] >= MIN_DISTANCE:
                        state[tid] = RUNNING

                elif state[tid] == RUNNING and ema_speed[tid] < MIN_RUNNING_SPEED*0.6:
                    state[tid] = IDLE
                    state_counter[tid] = 0
                    distance_window[tid] = 0

                is_running = state[tid] == RUNNING
                color = (0,0,255) if is_running else (0,255,0)

                cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
                cv2.putText(frame,f"ID {tid}",(x1,y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX,0.6,color,2)

        # ===== STREAM OR WINDOW =====
        if stream:
            yield frame
        else:
            cv2.imshow("Behavior Monitoring", frame)

            delay = frame_time - (time.time()-start)
            if delay > 0:
                time.sleep(delay)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

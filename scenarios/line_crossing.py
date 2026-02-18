import cv2
from ultralytics import YOLO
import torch

def side_of_line(p, a, b):
    return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])


def run(video, cfg, stream=False):

    line = cfg.get("line")
    restricted_point = cfg.get("restricted_point")

    if line is None or restricted_point is None:
        raise ValueError("Line configuration missing")

    a = tuple(line[0])
    b = tuple(line[1])
    restricted_sign = side_of_line(tuple(restricted_point), a, b)

    # -------- AUTO DEVICE --------
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Using device: {DEVICE}")

    # -------- AUTO MODEL DOWNLOAD --------
    model = YOLO("yolov8n")   # auto downloads if missing
    try:
        model.fuse()
    except Exception:
        pass

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")

    while True:
        ret, frame = cap.read()

        # LOOP VIDEO (important for browser streaming)
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        results = model.track(
            frame,
            persist=True,
            classes=[0],
            conf=0.3,
            device=DEVICE
        )

        # draw safety line
        cv2.line(frame, a, b, (0,255,255), 2)

        for r in results:
            if r.boxes.id is None:
                continue

            for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                x1, y1, x2, y2 = map(int, box)
                tid = int(tid)
                cx, cy = (x1+x2)//2, (y1+y2)//2

                person_sign = side_of_line((cx, cy), a, b)
                is_restricted = person_sign * restricted_sign > 0

                if is_restricted:
                    color = (255, 0, 255)
                    label = "RESTRICTED AREA"
                else:
                    color = (0, 255, 0)
                    label = f"ID {tid}"

                cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
                cv2.putText(frame,label,(x1,y1-10),
                            cv2.FONT_HERSHEY_SIMPLEX,0.7,color,2)

        # -------- STREAM OR LOCAL WINDOW --------
        if stream:
            yield frame
        else:
            cv2.imshow("Metro Safety Monitoring", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

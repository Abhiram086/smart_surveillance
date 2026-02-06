import cv2
from ultralytics import YOLO
from collections import defaultdict

line = []
drawing = True
selecting_side = False
restricted_sign = None

def side_of_line(p, a, b):
    return (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])

def mouse(event, x, y, flags, param):
    global line, drawing, selecting_side, restricted_sign

    if event == cv2.EVENT_LBUTTONDOWN:

        
        if drawing:
            line.append((x, y))
            if len(line) == 2:
                drawing = False
                selecting_side = True

        
        elif selecting_side:
            restricted_sign = side_of_line((x, y), line[0], line[1])
            selecting_side = False

def crossed(p1, p2, a, b):
    return side_of_line(p1, a, b) * side_of_line(p2, a, b) < 0

def run(video, cfg):
    global line, drawing, selecting_side, restricted_sign

    
    line = []
    drawing = True
    selecting_side = False
    restricted_sign = None

    model = YOLO("yolov8n.pt")
    model.to("cuda")
    model.fuse()

    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        print("ERROR: Cannot open video")
        return

    ret, frame = cap.read()
    if not ret:
        return

    cv2.namedWindow("Metro Setup")
    cv2.setMouseCallback("Metro Setup", mouse)

    while drawing or selecting_side:
        temp = frame.copy()

        if drawing:
            cv2.putText(
                temp,
                "Click TWO points to draw restricted line",
                (20,40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0,255,255),
                2
            )

        elif selecting_side:
            cv2.putText(
                temp,
                "Click on the RESTRICTED SIDE",
                (20,40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255,0,255),
                2
            )

        for p in line:
            cv2.circle(temp, p, 5, (0,255,255), -1)

        if len(line) == 2:
            cv2.line(temp, line[0], line[1], (0,255,255), 2)

        cv2.imshow("Metro Setup", temp)
        if cv2.waitKey(1) == 27:  # ESC
            cap.release()
            cv2.destroyAllWindows()
            return

    cv2.destroyWindow("Metro Setup")

    centers = defaultdict(list)

    cv2.namedWindow("Metro Safety Monitoring", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Metro Safety Monitoring", 1280, 720)
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model.track(
            frame,
            persist=True,
            classes=[0],
            conf=0.3,
            device="cuda"
        )

        cv2.line(frame, line[0], line[1], (0,255,255), 2)

        for r in results:
            if r.boxes.id is None:
                continue

            for box, tid in zip(r.boxes.xyxy, r.boxes.id):
                x1, y1, x2, y2 = map(int, box)
                tid = int(tid)
                cx, cy = (x1+x2)//2, (y1+y2)//2

                person_sign = side_of_line((cx, cy), line[0], line[1])

                is_restricted = (
                    restricted_sign is not None and
                    person_sign * restricted_sign > 0
                )

                if is_restricted:
                    color = (255, 0, 255)  
                    label = "RESTRICTED AREA"
                else:
                    color = (0, 255, 0)
                    label = f"ID {tid}"

                cv2.rectangle(frame,(x1,y1),(x2,y2),color,2)
                cv2.putText(
                    frame,
                    label,
                    (x1, y1-10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    color,
                    2
                )

        cv2.imshow("Metro Safety Monitoring", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

"""
camera_manager.py
Clean multi-camera manager with single YOLO inference thread
"""

from __future__ import annotations

import cv2
import threading
import queue
import time
from typing import Dict, Any
import numpy as np
import torch
from ultralytics import YOLO


# ─────────────────────────────────────────────
# Camera discovery
# ─────────────────────────────────────────────

def get_available_cameras(max_cameras: int = 5):

    cameras = []

    for i in range(max_cameras):

        cap = cv2.VideoCapture(i)

        if cap.isOpened():
            cameras.append({
                "id": i,
                "name": f"Camera {i}"
            })
            cap.release()

    return cameras


# ─────────────────────────────────────────────
# Global Config
# ─────────────────────────────────────────────

CONF = 0.35
CLASSES = [0]  # person
MAX_CAMERAS = 5
JPEG_QUALITY = 75

_device = "cuda" if torch.cuda.is_available() else "cpu"


# ─────────────────────────────────────────────
# Global State
# ─────────────────────────────────────────────

_model: YOLO | None = None
_model_lock = threading.Lock()

_infer_queue: queue.Queue = queue.Queue(maxsize=10)

_result_queues: Dict[str, queue.Queue] = {}
_latest_frames: Dict[str, bytes] = {}

_reader_stop: Dict[str, threading.Event] = {}

_registry_lock = threading.Lock()

_infer_thread_started = False


# ─────────────────────────────────────────────
# Model Loader
# ─────────────────────────────────────────────

def _get_model():

    global _model

    if _model is None:

        with _model_lock:

            if _model is None:

                print(f"[YOLO] loading model on {_device}")

                _model = YOLO("yolov8n.pt")

                try:
                    _model.fuse()
                except:
                    pass

                print("[YOLO] model ready")

    return _model


# ─────────────────────────────────────────────
# Inference Thread
# ─────────────────────────────────────────────

def _infer_loop():

    model = _get_model()

    while True:

        try:
            camera_id, frame = _infer_queue.get()

        except:
            continue

        try:

            results = model(frame, conf=CONF, classes=CLASSES, verbose=False)

            boxes = []

            if results and results[0].boxes is not None:

                for b in results[0].boxes.xyxy.cpu().numpy():
                    x1, y1, x2, y2 = map(int, b[:4])
                    boxes.append((x1, y1, x2, y2))

            q = _result_queues.get(camera_id)

            if q and not q.full():
                q.put(boxes)

        except Exception as e:
            print("Inference error:", e)


def _ensure_infer_thread():

    global _infer_thread_started

    if not _infer_thread_started:

        t = threading.Thread(target=_infer_loop, daemon=True)
        t.start()

        _infer_thread_started = True

        print("[camera_manager] inference thread started")


# ─────────────────────────────────────────────
# Camera Reader
# ─────────────────────────────────────────────

def _reader_thread(camera_id: str, cfg: dict, stop_event: threading.Event):

    source = cfg.get("video", 0)

    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print("Failed to open camera", source)
        return

    frame_skip = 0

    while not stop_event.is_set():

        ret, frame = cap.read()

        if not ret:
            time.sleep(0.1)
            continue

        frame_skip += 1

        if frame_skip % 3 == 0:

            try:
                _infer_queue.put_nowait((camera_id, frame))
            except:
                pass

        boxes = []

        q = _result_queues.get(camera_id)

        if q and not q.empty():
            boxes = q.get()

        for x1, y1, x2, y2 in boxes:

            cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)

        _, jpg = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
        )

        _latest_frames[camera_id] = jpg.tobytes()

    cap.release()

    print(f"[camera_manager] camera stopped {camera_id}")


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def start(camera_id: str, scenario: str, cfg: Dict[str, Any]):

    _ensure_infer_thread()

    with _registry_lock:

        if camera_id in _reader_stop:
            stop(camera_id)

        if len(_reader_stop) >= MAX_CAMERAS:
            raise ValueError("Maximum cameras reached")

        stop_event = threading.Event()

        _reader_stop[camera_id] = stop_event
        _result_queues[camera_id] = queue.Queue(maxsize=3)
        _latest_frames[camera_id] = None

    t = threading.Thread(
        target=_reader_thread,
        args=(camera_id, cfg, stop_event),
        daemon=True
    )

    t.start()

    print(f"[camera_manager] started {camera_id}")


def stop(camera_id: str):

    with _registry_lock:

        ev = _reader_stop.get(camera_id)

        if ev:
            ev.set()

        _reader_stop.pop(camera_id, None)
        _result_queues.pop(camera_id, None)
        _latest_frames.pop(camera_id, None)


def stop_all():

    with _registry_lock:

        for ev in _reader_stop.values():
            ev.set()

        _reader_stop.clear()
        _result_queues.clear()
        _latest_frames.clear()

    print("[camera_manager] all cameras stopped")


# ─────────────────────────────────────────────
# Frame fetcher for API
# ─────────────────────────────────────────────

def get_frame(camera_id: str):

    return _latest_frames.get(camera_id)
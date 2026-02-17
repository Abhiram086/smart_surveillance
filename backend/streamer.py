import sys
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(PROJECT_ROOT)


import cv2
import json
import os
from scenarios.behavior import run as behavior_run
from scenarios.line_crossing import run as metro_run

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def frame_generator(scenario: str):
    config_map = {
        "metro_line": "config/metro_line.json",
        "behavior": "config/behavior.json"
    }

    if scenario not in config_map:
        raise ValueError("Invalid scenario")

    config_path = os.path.join(PROJECT_ROOT, config_map[scenario])

    with open(config_path) as f:
        cfg = json.load(f)

    video = cfg["video"]

    # choose pipeline
    if scenario == "behavior":
        gen = behavior_run(video, cfg, stream=True)
    else:
        gen = metro_run(video, cfg, stream=True)

    for frame in gen:
        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
        )

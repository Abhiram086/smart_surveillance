import sys
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(PROJECT_ROOT)


import cv2
import json
import os
from fastapi import Request
from scenarios.behavior import run as behavior_run
from scenarios.line_crossing import run as metro_run


async def await_request_disconnected(request: Request) -> bool:
    """Return True if the client has disconnected from the request.

    FastAPI's ``request.is_disconnected()`` is a coroutine; this wrapper makes
    the intent clearer and handles any exceptions.
    """
    try:
        return await request.is_disconnected()
    except Exception:
        return True


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

async def frame_generator(
    request: Request,
    scenario: str,
    line: str | None = None,
    restricted_point: str | None = None,
    video: str | None = None,
):
    """Asynchronous generator that yields frames until the client disconnects.

    Converting the generator to async allows us to ``await``
    ``request.is_disconnected()`` at each iteration so the pipeline can be
    terminated promptly when the browser navigates away or the user stops.

    The remainder of the body is unchanged from the previous synchronous
    implementation.
    """

    config_map = {
        "metro_line": "config/metro_line.json",
        "behavior": "config/behavior.json"
    }

    if scenario not in config_map:
        raise ValueError("Invalid scenario")

    config_path = os.path.join(PROJECT_ROOT, config_map[scenario])

    with open(config_path) as f:
        cfg = json.load(f)

    # override config values from query params
    if video is not None:
        # allow numeric strings (camera indices) or paths/URLs
        try:
            cfg["video"] = int(video)
        except ValueError:
            cfg["video"] = video

    if line is not None:
        parts = line.split(",")
        if len(parts) == 4:
            coords = list(map(int, parts))
            cfg["line"] = [[coords[0], coords[1]], [coords[2], coords[3]]]

    if restricted_point is not None:
        parts = restricted_point.split(",")
        if len(parts) == 2:
            coords = list(map(int, parts))
            cfg["restricted_point"] = [coords[0], coords[1]]

    video_src = cfg["video"]
    # if video_src is a relative filesystem path, make it absolute with PROJECT_ROOT
    if isinstance(video_src, str):
        # skip URLs and empty strings
        if not (video_src.startswith("http://") or video_src.startswith("https://") or video_src.startswith("rtmp://")):
            # numeric strings may have been converted above; if still str try to join
            if not os.path.isabs(video_src):
                video_src = os.path.join(PROJECT_ROOT, video_src)
            # normalize to handle leading ./ etc
            video_src = os.path.normpath(video_src)
    cfg["video"] = video_src

    # choose pipeline
    try:
        if scenario == "behavior":
            gen = behavior_run(video_src, cfg, stream=True)
        else:
            gen = metro_run(video_src, cfg, stream=True)
    except Exception as e:
        # pipeline failed before yielding any frames (e.g. missing config)
        print(f"[ERROR] scenario '{scenario}' initialization failed: {e}")
        # produce a static error frame so client can see something
        import numpy as np
        err_frame = np.zeros((240, 640, 3), dtype="uint8")
        cv2.putText(err_frame, str(e), (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        while True:
            _, buffer = cv2.imencode('.jpg', err_frame)
            frame_bytes = buffer.tobytes()
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
        return
    # generator may be None if pipeline detected an error itself
    if gen is None:
        err = "pipeline returned no frames (video open failure perhaps)"
        print(f"[ERROR] {err}")
        import numpy as np
        err_frame = np.zeros((240, 640, 3), dtype="uint8")
        cv2.putText(err_frame, err, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        while True:
            _, buffer = cv2.imencode('.jpg', err_frame)
            frame_bytes = buffer.tobytes()
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
            )
        return

    for frame in gen:
        # break loop if client disconnected
        if await request.is_disconnected():
            print("[INFO] client disconnected, stopping generator")
            break

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n'
        )

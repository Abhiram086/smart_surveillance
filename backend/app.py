from __future__ import annotations

import asyncio
import json
import os

from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI, UploadFile, File, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from psycopg2.extensions import connection

import cv2
import numpy as np

import camera_manager

from streamer import frame_generator, stop_signals
from db import init_db_pool, close_db_pool, get_db_connection
from db.schema import create_tables
from db.auth import authenticate_user, register_user


try:
    from routes_auth import router as auth_router
except ImportError:
    auth_router = None


app = FastAPI()


# ─────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=4, max_length=128)
    role: str = Field(min_length=3, max_length=20)


class LoginRequest(BaseModel):
    username: str
    password: str


class StartCameraRequest(BaseModel):
    camera_id: str
    scenario: str
    video: str | int | None = None
    line: str | None = None
    restricted_point: str | None = None
    zone: str | None = None
    infer_every: int = 2


# ─────────────────────────────────────────────
# Startup / shutdown
# ─────────────────────────────────────────────

@app.on_event("startup")
def on_startup():

    init_db_pool()

    db_dep = get_db_connection()
    conn = next(db_dep)

    try:
        create_tables(conn)
    finally:
        db_dep.close()


@app.on_event("shutdown")
def on_shutdown():

    close_db_pool()

    try:
        camera_manager.stop_all()
    except Exception:
        pass


# ─────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────

if auth_router:
    app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

VIDEOS_DIR = os.path.join(PROJECT_ROOT, "videos")
CONFIG_DIR = os.path.join(PROJECT_ROOT, "config")

os.makedirs(VIDEOS_DIR, exist_ok=True)

app.mount("/videos", StaticFiles(directory=VIDEOS_DIR), name="videos")


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Smart Surveillance Backend Running"}


# ─────────────────────────────────────────────
# Camera discovery
# ─────────────────────────────────────────────

@app.get("/cameras")
def list_cameras():

    try:
        return camera_manager.get_available_cameras()

    except Exception as e:

        print("Camera scan error:", e)

        return []


# ─────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────

@app.post("/api/register")
def api_register(
    payload: RegisterRequest,
    conn: connection = Depends(get_db_connection)
):

    role = payload.role.lower()

    if role not in {"admin", "viewer"}:
        raise HTTPException(400, "Role must be admin or viewer")

    user = register_user(conn, payload.username, payload.password, role)

    return {"message": "User registered successfully", "user": user}


@app.post("/api/login")
def api_login(
    payload: LoginRequest,
    conn: connection = Depends(get_db_connection)
):

    user = authenticate_user(conn, payload.username, payload.password)

    if user is None:
        raise HTTPException(401, "Invalid username or password")

    return {"message": "Login successful", "user": user}


# ─────────────────────────────────────────────
# Upload video
# ─────────────────────────────────────────────

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):

    dest = os.path.join(VIDEOS_DIR, file.filename)

    with open(dest, "wb") as f:
        f.write(await file.read())

    return {"location": f"videos/{file.filename}"}


# ─────────────────────────────────────────────
# Legacy streaming
# ─────────────────────────────────────────────

@app.post("/stop")
async def stop_stream(token: str):

    stop_signals[token] = True

    return {"stopped": True}


@app.get("/stream/{scenario}")
def stream_video(
    request: Request,
    scenario: str,
    line: str | None = None,
    restricted_point: str | None = None,
    zone: str | None = None,
    video: str | None = None,
    token: str | None = None,
):

    return StreamingResponse(
        frame_generator(request, scenario, line, restricted_point, zone, video, token),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ─────────────────────────────────────────────
# Config builder
# ─────────────────────────────────────────────

def _build_cfg(scenario: str, payload: StartCameraRequest):

    config_map = {
        "metro_line": "metro_line.json",
        "behavior": "behavior.json",
        "zone_detection": "restricted_zone.json",
    }

    cfg_file = config_map.get(scenario)

    if not cfg_file:
        raise HTTPException(400, f"Unknown scenario: {scenario}")

    with open(os.path.join(CONFIG_DIR, cfg_file)) as f:
        cfg = json.load(f)

    video = payload.video

    if isinstance(video, str) and video.isdigit():
        video = int(video)

    if video is not None:
        cfg["video"] = video

    cfg["infer_every"] = max(1, min(5, payload.infer_every))

    return cfg


# ─────────────────────────────────────────────
# Multi-camera
# ─────────────────────────────────────────────

@app.post("/cameras/start")
def start_camera(payload: StartCameraRequest):

    cfg = _build_cfg(payload.scenario, payload)

    camera_manager.start(payload.camera_id, payload.scenario, cfg)

    return {
        "started": True,
        "camera_id": payload.camera_id
    }


@app.post("/cameras/stop")
def stop_camera(camera_id: str):

    camera_manager.stop(camera_id)

    return {
        "stopped": True,
        "camera_id": camera_id
    }


@app.get("/cameras/status")
def cameras_status():

    try:
        return {
            "cameras": list(camera_manager._latest_frames.keys())
        }

    except Exception:
        return {"cameras": []}


@app.get("/cameras/stream/{camera_id}")
async def stream_camera(camera_id: str, request: Request):

    async def generate():

        placeholder = None

        while True:

            if await request.is_disconnected():
                break

            frame = camera_manager.get_frame(camera_id)

            if frame is None:

                if placeholder is None:
                    placeholder = _make_placeholder_frame()

                frame = placeholder
                await asyncio.sleep(0.2)

            else:
                await asyncio.sleep(0.03)

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + frame
                + b"\r\n"
            )

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ─────────────────────────────────────────────
# Placeholder frame
# ─────────────────────────────────────────────

def _make_placeholder_frame():

    img = np.zeros((240, 426, 3), dtype=np.uint8)

    cv2.putText(
        img,
        "Connecting...",
        (90, 120),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (200,200,200),
        2
    )

    _, buf = cv2.imencode(".jpg", img)

    return buf.tobytes()
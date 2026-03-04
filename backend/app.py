from __future__ import annotations

import os

from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends, FastAPI, UploadFile, File, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from psycopg2.extensions import connection

from streamer import frame_generator, stop_signals
from db import init_db_pool, close_db_pool, get_db_connection
from db.schema import create_tables
from db.auth import authenticate_user, register_user

# optional legacy router (may not exist on rollback)
try:
    from routes_auth import router as auth_router  # type: ignore
except ImportError:
    auth_router = None

app = FastAPI()

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=4, max_length=128)
    role: str = Field(min_length=3, max_length=20)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


@app.on_event("startup")
def on_startup() -> None:
    init_db_pool()
    db_dep = get_db_connection()
    conn = next(db_dep)
    try:
        create_tables(conn)
    except Exception as exc:  # don't fail startup for permission issues
        # permission hints are printed by create_tables
        print(f"startup: {exc}")
    finally:
        db_dep.close()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_db_pool()

# include the legacy router if available
if auth_router is not None:
    app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# serve uploaded video files so that cv2 can open them later
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VIDEOS_DIR = os.path.join(PROJECT_ROOT, "videos")
# ensure directory exists
os.makedirs(VIDEOS_DIR, exist_ok=True)

app.mount("/videos", StaticFiles(directory=VIDEOS_DIR), name="videos")


@app.get("/")
def root():
    return {"status": "Smart Surveillance Backend Running"}


@app.post("/api/register")
def api_register(
    payload: RegisterRequest,
    conn: connection = Depends(get_db_connection),
):
    role = payload.role.strip().lower()
    if role not in {"admin", "viewer"}:
        raise HTTPException(status_code=400, detail="Role must be admin or viewer")
    try:
        user = register_user(conn, payload.username, payload.password, role)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"message": "User registered successfully", "user": user}


@app.post("/api/login")
def api_login(
    payload: LoginRequest,
    conn: connection = Depends(get_db_connection),
):
    user = authenticate_user(conn, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"message": "Login successful", "user": user}

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Receive a video file from the frontend and save to the videos folder.

    Returns a relative path that can be supplied as the ``video`` parameter
    when starting a scenario.  The frontend will include this path in the
    query string; ``cv2.VideoCapture`` can open it since the working directory
    is the project root.
    """
    dest_path = os.path.join(VIDEOS_DIR, file.filename)
    # overwrite if already exists
    with open(dest_path, "wb") as f:
        content = await file.read()
        f.write(content)

    return {"location": f"videos/{file.filename}"}

@app.post("/stop")
async def stop_stream(token: str):
    """Signal a running stream identified by *token* to terminate.

    The frontend generates a random token when it starts a scenario and
    includes it as a query parameter.  Sending a POST to this endpoint with
    the same token sets a flag that the streaming generator monitors and
    breaks out immediately.  This allows the UI to stop a video even if the
    browser connection remains open for some reason.
    """
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
    """Return a video stream processed by the chosen scenario.

    Optional query parameters allow the frontend to override configuration
    values without editing the JSON files.  Supported overrides:

    * ``line``: four comma separated ints ``x1,y1,x2,y2`` for line crossing
    * ``restricted_point``: two comma separated ints ``x,y`` to choose side
    * ``zone``: semicolon-separated ``x,y`` pairs defining a polygonal zone
      (first and last point need not be repeated)
    * ``video``: path or URL of the video/source to use instead of the
      value stored in the config file (e.g. camera index or file path).
    """

    # forward an optional token so that the frontend can request a
    # running stream be stopped explicitly (see /stop below).
    return StreamingResponse(
        frame_generator(request, scenario, line, restricted_point, zone, video, token),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

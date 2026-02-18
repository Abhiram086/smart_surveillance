from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
from streamer import frame_generator

app = FastAPI()

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

@app.get("/stream/{scenario}")
def stream_video(
    request: Request,
    scenario: str,
    line: str | None = None,
    restricted_point: str | None = None,
    video: str | None = None,
):
    """Return a video stream processed by the chosen scenario.

    Optional query parameters allow the frontend to override configuration
    values without editing the JSON files.  Supported overrides:

    * ``line``: four comma separated ints ``x1,y1,x2,y2`` for line crossing
    * ``restricted_point``: two comma separated ints ``x,y`` to choose side
    * ``video``: path or URL of the video/source to use instead of the
      value stored in the config file (e.g. camera index or file path).
    """

    return StreamingResponse(
        frame_generator(request, scenario, line, restricted_point, video),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

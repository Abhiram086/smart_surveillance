from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from streamer import frame_generator

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Smart Surveillance Backend Running"}

@app.get("/stream/{scenario}")
def stream_video(scenario: str):
    return StreamingResponse(
        frame_generator(scenario),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

import json
import sys
import os

# project root = folder where main.py exists
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))


def resolve_video_source(video_value):
    """
    Supports:
    1. Webcam index (0,1,2...)
    2. Relative video file path
    """

    # Webcam case
    if isinstance(video_value, int):
        print(f"[INFO] Using webcam index: {video_value}")
        return video_value

    # Video file case
    if isinstance(video_value, str):

        video_path = os.path.join(PROJECT_ROOT, video_value)

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video not found: {video_path}")

        print(f"[INFO] Using video file: {video_path}")

        return video_path

    raise ValueError("Invalid video source in config")


def run_pipeline(config_relative_path):

    config_path = os.path.join(PROJECT_ROOT, config_relative_path)

    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Config not found: {config_path}")

    with open(config_path) as f:
        cfg = json.load(f)

    scenario = cfg["scenario"]
    video_source = resolve_video_source(cfg["video"])

    if scenario == "LINE_CROSSING":
        from scenarios.line_crossing import run

    elif scenario == "BEHAVIOR":
        from scenarios.behavior import run

    else:
        raise ValueError(f"Unknown scenario: {scenario}")

    run(video_source, cfg)


# terminal usage
if __name__ == "__main__":

    if len(sys.argv) < 2:
        print("Usage: python main.py <config_file>")
        sys.exit()

    run_pipeline(sys.argv[1])
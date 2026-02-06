import json
import sys

if len(sys.argv) < 2:
    print("Usage: python main.py <config_file>")
    exit()

config_path = sys.argv[1]

with open(config_path) as f:
    cfg = json.load(f)

scenario = cfg["scenario"]
video = cfg["video"]

if scenario == "LINE_CROSSING":
    from scenarios.line_crossing import run
elif scenario == "BEHAVIOR":
    from scenarios.behavior import run
else:
    raise ValueError("Unknown scenario")

run(video, cfg)

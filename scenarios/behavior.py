from core.detector import run_behavior


def run(video_source, cfg, stream=False):
    """
    Entry point for BEHAVIOR scenario.
    Ensures generator returned by detector is executed.
    """

    print("[INFO] Starting BEHAVIOR detection pipeline")

    result = run_behavior(video_source, cfg, stream)

    # run the generator so the detection loop executes
    if result is not None:
        for _ in result:
            pass
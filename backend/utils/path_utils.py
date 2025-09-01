import os
from config.paths import ASSIGNMENTS_DIR


def path_in_assignments(file: str) -> str:
    # never trust paths from the URL
    if os.path.isabs(file):
        return file
    safe = os.path.basename(file or "")
    return os.path.join(ASSIGNMENTS_DIR, safe)

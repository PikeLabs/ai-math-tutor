# backend/config/paths.py
import os

# backend/… absolute root
BACKEND_ROOT = os.path.dirname(os.path.abspath(os.path.join(__file__, "..")))

# Allow overriding at deploy time (e.g., STORAGE_ROOT=/tmp on read-only FS)
STORAGE_ROOT = os.getenv("STORAGE_ROOT", os.path.join(BACKEND_ROOT, "storage"))
if os.getenv("STORAGE_ROOT"):
    os.environ.setdefault("TMPDIR", STORAGE_ROOT)

ASSIGNMENTS_DIR = os.path.join(STORAGE_ROOT, "assignments")  # original PDFs
SLIDE_IMAGES_DIR = os.path.join(STORAGE_ROOT, "slide_images")  # derived PNGs
AUDIO_SESSIONS_DIR = os.path.join(STORAGE_ROOT, "audio_sessions")


def ensure_storage_dirs():
    for d in (ASSIGNMENTS_DIR, SLIDE_IMAGES_DIR, AUDIO_SESSIONS_DIR):
        os.makedirs(d, exist_ok=True)


ensure_storage_dirs()

BACKEND_DOTENV = os.path.join(BACKEND_ROOT, ".env")

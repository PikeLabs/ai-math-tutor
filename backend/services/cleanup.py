import threading, time
from services.pdf_image_service import cleanup_old_sessions
from services.feedback_service import cleanup_old_audio_sessions


def start_cleanup_daemon():
    def _loop():
        while True:
            try:
                cleanup_old_sessions()
            except Exception:
                pass
            try:
                cleanup_old_audio_sessions()
            except Exception:
                pass
            time.sleep(30 * 60)  # every 30 minutes

    t = threading.Thread(target=_loop, daemon=True, name="cleanup-loop")
    t.start()

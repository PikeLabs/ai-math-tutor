import os
from flask import Blueprint, send_file, request

from services.pdf_image_service import get_slide_image_path
from services.feedback_service import get_audio_segment_path
from utils.http import not_found, internal_error
from config.paths import AUDIO_SESSIONS_DIR

bp = Blueprint("media", __name__)


# TODO: Update
@bp.get("/slide-image/<upload_id>/<int:slide_number>")
def get_slide_image(upload_id, slide_number):
    image_type = (request.args.get("type") or "thumbnail").strip().lower()
    if image_type not in ("thumbnail", "full"):
        image_type = "thumbnail"

    path = get_slide_image_path(upload_id, slide_number, image_type=image_type)
    if not path or not os.path.exists(path):
        return not_found("Slide image not found")

    return send_file(path, mimetype="image/png")


@bp.get("/audio-segment/<session_id>/<int:slide_number>")
def get_audio_segment(session_id, slide_number):
    try:
        audio_path = get_audio_segment_path(session_id, slide_number)

        if not audio_path or not os.path.exists(audio_path):
            session_dir = os.path.join(AUDIO_SESSIONS_DIR, session_id)
            if os.path.exists(session_dir):
                print(f"📁 Files in audio session directory: {os.listdir(session_dir)}")
            return not_found("Audio segment not found")

        return send_file(audio_path, mimetype="audio/wav")

    except Exception as e:
        print(f"Error serving audio segment: {str(e)}")
        return internal_error(f"Internal Error - {str(e)}")

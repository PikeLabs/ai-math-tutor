import os
from flask import Blueprint, jsonify, send_file, request
from services.pdf_image_service import get_slide_image_path
from services.feedback_service import get_audio_segment_path

bp = Blueprint("media", __name__, url_prefix="/api/v1")


# TODO: Update
@bp.get("/slide-image/<session_id>/<int:slide_number>")
def get_slide_image(session_id, slide_number):
    try:
        image_type = request.args.get("type", "thumbnail")  # requires request import
    except Exception:
        image_type = "thumbnail"

    try:
        image_type = request.args.get("type", "thumbnail")
        image_path = get_slide_image_path(session_id, slide_number, image_type)

        if not image_path or not os.path.exists(image_path):
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            session_dir = os.path.abspath(
                os.path.join(backend_dir, "..", "slide_images", session_id)
            )
            if os.path.exists(session_dir):
                print(f"📁 Files in session directory: {os.listdir(session_dir)}")

            return jsonify({"error": "Slide image not found"}), 404

        return send_file(image_path, mimetype="image/png")
    except Exception as e:
        print(f"Error serving slide image: {str(e)}")
        return jsonify({"error": str(e)}), 500


@bp.get("/audio-segment/<session_id>/<int:slide_number>")
def get_audio_segment(session_id, slide_number):
    try:
        audio_path = get_audio_segment_path(session_id, slide_number)

        if not audio_path or not os.path.exists(audio_path):
            backend_dir = os.path.dirname(os.path.abspath(__file__))
            session_dir = os.path.abspath(
                os.path.join(backend_dir, "..", "audio_sessions", session_id)
            )

            if os.path.exists(session_dir):
                print(f"📁 Files in audio session directory: {os.listdir(session_dir)}")
            return jsonify({"error": "Audio segment not found"}), 404

        return send_file(audio_path, mimetype="audio/wav")

    except Exception as e:
        print(f"Error serving audio segment: {str(e)}")
        return jsonify({"error": str(e)}), 500

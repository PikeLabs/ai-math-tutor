import os, uuid
from flask import Blueprint, request, jsonify
from services.pdf_image_service import save_slide_images, cleanup_old_sessions
from services.feedback_service import cleanup_old_audio_sessions

bp = Blueprint("uploads", __name__, url_prefix="/api")


@bp.post("/process-upload")
def process_upload():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        if not file.filename.endswith(".pdf"):
            return jsonify({"error": "File must be a PDF"}), 400

        session_id = str(uuid.uuid4())

        assignments_dir = os.path.join(os.path.dirname(__file__), "..", "assignments")
        assignments_dir = os.path.abspath(assignments_dir)
        os.makedirs(assignments_dir, exist_ok=True)

        safe_filename = f"uploaded_{session_id}_{file.filename}"
        permanent_pdf_path = os.path.join(assignments_dir, safe_filename)
        file.save(permanent_pdf_path)

        slide_paths = save_slide_images(permanent_pdf_path, session_id)

        try:
            import PyPDF2

            with open(permanent_pdf_path, "rb") as pdf_file:
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                actual_page_count = len(pdf_reader.pages)
        except Exception:
            actual_page_count = len(slide_paths) if slide_paths else 4

        slide_count = len(slide_paths) if slide_paths else actual_page_count

        return jsonify(
            {
                "session_id": session_id,
                "slide_count": slide_count,
                "slides": (
                    list(slide_paths.keys())
                    if slide_paths
                    else list(range(1, slide_count + 1))
                ),
                "filename": safe_filename,
                "images_processed": bool(slide_paths),
                "message": "PDF uploaded successfully"
                + (
                    " with slide images"
                    if slide_paths
                    else " (images unavailable - install poppler for slide images)"
                ),
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.post("/cleanup")
def cleanup_old_files():
    try:
        cleanup_old_sessions()
        cleanup_old_audio_sessions()
        return jsonify({"message": "Cleanup completed"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

import os
from flask import Blueprint, request

from config.paths import ASSIGNMENTS_DIR
from services.feedback_service import cleanup_old_audio_sessions
from services.pdf_image_service import cleanup_old_sessions
from utils.http import bad_request, internal_error, ok


bp = Blueprint("uploads", __name__)


def _ensure_assignments_dir():
    os.makedirs(ASSIGNMENTS_DIR, exist_ok=True)


@bp.post("/upload-slides")
def api_upload_slides():
    try:
        if "file" not in request.files:
            return bad_request("No file provided")

        file = request.files["file"]
        if not file.filename.endswith(".pdf"):
            return bad_request("File must be a PDF")

        # DB Session id (authoritative)
        session_id = request.form.get("sessionId") or None

        if not session_id:
            return bad_request("sessionId is required")

        # Save local original PDF for text extraction & image generation
        _ensure_assignments_dir()
        original = os.path.basename(file.filename or "upload.pdf")
        safe_filename = f"uploaded_{session_id}_{original}"
        local_pdf_path = os.path.join(ASSIGNMENTS_DIR, safe_filename)
        file.save(local_pdf_path)

        # Determine slide count (fallbacks)
        try:
            import PyPDF2

            with open(local_pdf_path, "rb") as pdf_file:
                actual_page_count = len(PyPDF2.PdfReader(pdf_file).pages)
        except Exception:
            actual_page_count = 1

        slide_count = actual_page_count

        return ok(
            {
                "session_id": session_id,  # the Session this upload is associated with
                "slide_count": slide_count,
                "slides": list(range(1, slide_count + 1)),
                "filename": safe_filename,  # saved local filename for /assignments/slides
                "images_processed": False,
                "message": "PDF uploaded successfully (images will be generated at completion)",
            }
        )

    except Exception as e:
        return internal_error(str(e))


@bp.post("/cleanup")
def cleanup_old_files():
    try:
        cleanup_old_sessions()
        cleanup_old_audio_sessions()
        return ok({"message": "Cleanup completed"})
    except Exception as e:
        error_message = f"Internal Error: {str(e)}"
        return internal_error(error_message)

import os, uuid, glob
from flask import Blueprint, request, jsonify
from services.pdf_image_service import (
    save_slide_images,
    cleanup_old_sessions,
    cleanup_session_images,
    PDF_PROCESSING_AVAILABLE,
)
from utils.http import bad_request
from config.paths import ASSIGNMENTS_DIR
from services.feedback_service import cleanup_old_audio_sessions
from services.database_service import update_session, get_session_by_id
from lib.aws import (
    upload_file,
    build_key,
    public_url,
    delete_file,
    parse_s3_key_from_url,
)

bp = Blueprint("uploads", __name__)


def _ensure_assignments_dir():
    os.makedirs(ASSIGNMENTS_DIR, exist_ok=True)


def _delete_local_pdf_for_processing_session(upload_id: str):
    """
    Our saved PDF name pattern: uploaded_{upload_id}_{originalName}.pdf
    We remove any that match this processing id.
    """
    pattern = os.path.join(ASSIGNMENTS_DIR, f"uploaded_{upload_id}_*.pdf")
    for path in glob.glob(pattern):
        try:
            os.remove(path)
        except Exception as e:
            print(f"⚠️ Failed to remove local PDF {path}: {e}")


@bp.post("/upload-slides")
def api_upload_slides():
    try:

        print("📝 /upload-slides called", request)

        if "file" not in request.files:
            return bad_request("No file provided")

        file = request.files["file"]
        if not file.filename.endswith(".pdf"):
            return bad_request("File must be a PDF")

        # DB Session id (authoritative)
        session_id = request.form.get("sessionId") or None
        previous_upload_id = request.form.get("previousUploadId") or None

        # Per-upload namespace
        upload_id = str(uuid.uuid4())

        # Save local original PDF for text extraction & image generation
        _ensure_assignments_dir()

        original = os.path.basename(file.filename or "upload.pdf")
        safe_filename = f"uploaded_{upload_id}_{original}"
        local_pdf_path = os.path.join(ASSIGNMENTS_DIR, safe_filename)
        file.save(local_pdf_path)

        # Generate slide images (if poppler available)
        if PDF_PROCESSING_AVAILABLE:
            slide_paths = save_slide_images(local_pdf_path, upload_id)
        else:
            print(
                "⚠️ PDF processing not available (missing poppler/pdf2image) — skipping image extraction"
            )
            slide_paths = {}

        # Determine slide count (fallbacks)
        try:
            import PyPDF2

            with open(local_pdf_path, "rb") as pdf_file:
                pdf_reader = PyPDF2.PdfReader(pdf_file)
                actual_page_count = len(pdf_reader.pages)
        except Exception:
            actual_page_count = len(slide_paths) if slide_paths else 1

        slide_count = len(slide_paths) if slide_paths else actual_page_count

        # Try S3 upload (optional)
        s3_url = None
        try:
            # build an S3 key under a stable prefix per processing session
            s3_key = build_key(upload_id, safe_filename)
            upload_file(local_pdf_path, s3_key, content_type="application/pdf")
            s3_url = public_url(s3_key)
        except Exception as e:
            # Non-fatal; we still have a local file for the live session
            print(f"⚠️ S3 upload failed: {e}")
            return jsonify({"error": "S3 upload failed"}), 500

        # If the FE passed a DB sessionId, update that record with pdfUrl/slideCount
        if session_id:
            try:
                # cleanup *previous* local artifacts if caller provided the old processing id
                if previous_upload_id:
                    cleanup_session_images(previous_upload_id)
                    _delete_local_pdf_for_processing_session(previous_upload_id)

                # if Session already had an S3 url, remove the old object
                try:
                    existing = get_session_by_id(session_id)
                except Exception as e:
                    existing = None
                    print(f"⚠️ get_session failed for {session_id}: {e}")

                if existing and getattr(existing, "pdfUrl", None):
                    old_key = parse_s3_key_from_url(existing.pdfUrl)
                    if old_key:
                        try:
                            delete_file(old_key)
                        except Exception as e:
                            print(f"⚠️ Failed to delete old S3 object {old_key}: {e}")

                # Update the Session row:
                pdf_url_to_store = s3_url
                update_session(
                    session_id,
                    {
                        "pdfUrl": pdf_url_to_store,
                        "slideCount": slide_count,
                    },
                )
            except Exception as e:
                # Non-fatal: we still return the upload info
                print(f"⚠️ Failed to update DB session {session_id}: {e}")

        return jsonify(
            {
                "session_id": session_id,  # the Session this upload is associated with
                "upload_id": upload_id,  # image/audio processing namespace
                "slide_count": slide_count,
                "slides": (
                    list(slide_paths.keys())
                    if slide_paths
                    else list(range(1, slide_count + 1))
                ),
                "filename": safe_filename,  # saved local filename for /assignments/slides
                "s3_url": s3_url,  # persisted location (optional)
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


@bp.delete("/pdf/session/<session_id>")
def delete_session_pdf(session_id: str):
    try:
        body = request.get_json(silent=True) or {}
        prev_processing_id = body.get("previousUploadId")

        # Cleanup local images & the local file
        if prev_processing_id:
            cleanup_session_images(prev_processing_id)
            _delete_local_pdf_for_processing_session(prev_processing_id)

        # Remove previous S3 object if present
        try:
            existing = get_session_by_id(session_id)
        except Exception:
            existing = None

        if existing and getattr(existing, "pdfUrl", None):
            old_key = parse_s3_key_from_url(existing.pdfUrl)
            if old_key:
                try:
                    delete_file(old_key)
                except Exception as e:
                    print(f"⚠️ Failed to delete S3 object {old_key}: {e}")

        # Null out the DB fields
        try:
            update_session(session_id, {"pdfUrl": None, "slideCount": None})
        except Exception as e:
            print(f"⚠️ Failed to clear session {session_id}: {e}")

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

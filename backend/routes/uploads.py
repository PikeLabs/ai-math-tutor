import os
from flask import Blueprint, request

from services.pdf_image_service import (
    save_slide_images,
    cleanup_old_sessions,
    cleanup_session_slide_images,
    PDF_PROCESSING_AVAILABLE,
)
from utils.http import bad_request, internal_error, ok
from config.paths import ASSIGNMENTS_DIR
from services.feedback_service import cleanup_old_audio_sessions
from services.database_service import (
    update_session,
    get_session_by_id,
    upsert_slide_asset,
)
from lib.aws import (
    upload_file,
    build_key,
    delete_file,
    parse_s3_key_from_url,
    build_s3_filename,
    S3_SLIDE_IMAGES_FOLDER,
)

bp = Blueprint("uploads", __name__)


def _ensure_assignments_dir():
    os.makedirs(ASSIGNMENTS_DIR, exist_ok=True)


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

        if not session_id:
            return bad_request("sessionId is required")

        # Save local original PDF for text extraction & image generation
        _ensure_assignments_dir()
        original = os.path.basename(file.filename or "upload.pdf")
        safe_filename = f"uploaded_{session_id}_{original}"
        local_pdf_path = os.path.join(ASSIGNMENTS_DIR, safe_filename)
        file.save(local_pdf_path)

        # Generate slide images (if poppler available)
        if PDF_PROCESSING_AVAILABLE:
            slide_paths = save_slide_images(local_pdf_path, session_id)
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

        try:
            # slide_paths format: { <slide_number>: {"full": "/path", "thumbnail": "/path"} }
            for slide_number, paths in (slide_paths or {}).items():
                full_path = paths.get("full")
                thumb_path = paths.get("thumbnail")

                if full_path and os.path.exists(full_path):
                    full_image_filename = build_s3_filename(slide_number, "full")

                    full_key = build_key(
                        session_id,
                        full_image_filename,
                        subdir=S3_SLIDE_IMAGES_FOLDER,
                    )

                    upload_file(full_path, full_key, content_type="image/png")

                    # Track in SlideAsset
                    upsert_slide_asset(
                        session_id=session_id,
                        slide_number=slide_number,
                        kind="image_full",
                        s3_key=full_key,
                        mime_type="image/png",
                    )

                if thumb_path and os.path.exists(thumb_path):
                    thumb_image_filename = build_s3_filename(slide_number, "thumb")
                    thumb_key = build_key(
                        session_id,
                        thumb_image_filename,
                        subdir=S3_SLIDE_IMAGES_FOLDER,
                    )

                    upload_file(thumb_path, thumb_key, content_type="image/png")

                    # Track in SlideAsset
                    upsert_slide_asset(
                        session_id=session_id,
                        slide_number=slide_number,
                        kind="image_thumb",
                        s3_key=thumb_key,
                        mime_type="image/png",
                    )

        except Exception as e:
            # Non-fatal; we still have a local file for the live session
            print(f"⚠️ S3 upload failed: {e}")
            # TODO: Do we need this return
            return bad_request("S3 upload failed")

        try:
            # cleanup *previous* local artifacts if caller provided the old processing id
            cleanup_session_slide_images(session_id)
        except Exception as e:
            print(f"⚠️ Failed to cleanup local slide images for {session_id}: {e}")

        # If the FE passed a DB sessionId, update that record with pdfUrl/slideCount
        try:
            try:
                existing = get_session_by_id(session_id)
            except Exception as e:
                existing = None
                print(f"⚠️ get_session failed for {session_id}: {e}")

            if existing and getattr(existing, "pdfUrl", None):
                prev_pdf = existing.pdfUrl or ""
                old_key = parse_s3_key_from_url(existing.pdfUrl)

                if old_key:
                    try:
                        delete_file(old_key)
                    except Exception as e:
                        print(f"⚠️ Failed to delete old S3 object {old_key}: {e}")
                else:
                    try:
                        if os.path.exists(prev_pdf):
                            os.remove(prev_pdf)
                    except Exception as e:
                        print(f"⚠️ Failed to delete old local PDF {prev_pdf}: {e}")

            # Update the Session with LOCAL working path (for dev cleanup/compat)
            pdf_url_to_store = local_pdf_path

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

        return ok(
            {
                "session_id": session_id,  # the Session this upload is associated with
                "slide_count": slide_count,
                "slides": (
                    list(slide_paths.keys())
                    if slide_paths
                    else list(range(1, slide_count + 1))
                ),
                "filename": safe_filename,  # saved local filename for /assignments/slides
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

import json
from flask import Blueprint, request
from utils.http import ok, bad_request
from utils.parsing import parse_int
from utils.decorators import require_json
from services.database_service import save_feedback
from services.feedback_service import generate_feedback


bp = Blueprint("feedback", __name__)


@bp.post("/feedback")
@require_json
def api_save_feedback_route():
    data = request.get_json(silent=True) or {}
    session_id = data.get("sessionId")

    if not session_id:
        return bad_request("sessionId is required")

    try:
        score = parse_int(data.get("presentationScore"), "presentationScore")
    except ValueError as e:
        return bad_request(str(e))

    fb = save_feedback(
        session_id=session_id,
        overall_feedback=data.get("overallFeedback", "") or "",
        presentation_score=score,
        slide_feedback=data.get("slideFeedback"),
        strengths=data.get("strengths"),
        improvements=data.get("improvements"),
    )

    return ok(fb.dict(), 201)


@bp.post("/feedback/generate")
def api_generate_and_save_feedback():
    """
    Generate feedback from messages (+ optional audio), then persist immediately.
    Accepts:
      - JSON body
      - or multipart/form-data with 'recording' blob
    """
    try:
        is_form = request.content_type and "multipart/form-data" in request.content_type

        # --- Extract inputs ---
        if is_form:
            # multipart
            session_id = request.form.get("sessionId")
            if not session_id:
                return bad_request("sessionId is required")

            try:
                messages = request.form.get("messages")
                messages = (messages and __import__("json").loads(messages)) or []
            except Exception:
                messages = []

            selected_assignment = request.form.get("selectedAssignment") or None
            slide_timestamps_raw = request.form.get("slideTimestamps")
            qa_timestamps_raw = request.form.get("qaTimestamps")

            try:
                slide_timestamps = (
                    slide_timestamps_raw
                    and __import__("json").loads(slide_timestamps_raw)
                ) or None
            except Exception:
                slide_timestamps = None

            try:
                qa_timestamps = (
                    json.loads(qa_timestamps_raw)
                    if qa_timestamps_raw not in (None, "")
                    else None
                )
            except Exception:
                qa_timestamps = None

            pdf_upload_id = request.form.get("pdfUploadId") or None
            pdf_slide_count = request.form.get("pdfSlideCount") or None
            try:
                pdf_slide_count = int(pdf_slide_count) if pdf_slide_count else None
            except Exception:
                pdf_slide_count = None

            recording = request.files.get("recording")  # may be None
        else:
            # json
            data = request.get_json(silent=True) or {}
            session_id = data.get("sessionId")
            if not session_id:
                return bad_request("sessionId is required")

            messages = data.get("messages") or []
            selected_assignment = data.get("selectedAssignment") or None
            slide_timestamps = data.get("slideTimestamps") or None
            pdf_upload_id = data.get("pdfUploadId") or None
            pdf_slide_count = data.get("pdfSlideCount")
            qa_timestamps = data.get("qaTimestamps") or None

            try:
                pdf_slide_count = int(pdf_slide_count) if pdf_slide_count else None
            except Exception:
                pdf_slide_count = None

            recording = None  # only via multipart

        # --- Call generator ---
        structured = generate_feedback(
            conversation_history=messages,
            slide_content=None,  # you can pass actual slide text if you have it
            presentation_recording=recording,
            slide_timestamps=slide_timestamps,
            assignment_filename=selected_assignment,
            pdf_session_id=pdf_upload_id,
            pdf_slide_count=pdf_slide_count,
            qa_timestamps=qa_timestamps,
            asset_session_id=session_id,
        )

        # Build a single “overall” paragraph by concatenating the parts we produced
        # (You can switch this to your FEEDBACK_SYSTEM_PROMPT style later)
        parts = []
        if structured and isinstance(structured, dict):
            for s in structured.get("slides", []):
                txt = s.get("raw_feedback_text")
                if txt:
                    parts.append(txt.strip())
            qa = structured.get("qa_feedback")
            if qa:
                # store compact JSON of QA, and also append a readable line
                parts.append(
                    f"Q&A — Impromptu: {qa.get('impromptu_response',{}).get('comment','')}; "
                    f"Composure: {qa.get('composure',{}).get('comment','')}"
                )

        overall_text = " ".join(p for p in parts if p) or "Feedback generated."

        # Persist to DB immediately
        # We serialize the structured object into slide_feedback so it’s queryable later.
        import json as _json

        fb = save_feedback(
            session_id=session_id,
            overall_feedback=overall_text[:2000],  # guard length if desired
            presentation_score=None,  # you can compute a score later if needed
            slide_feedback=_json.dumps(structured),
            strengths=None,
            improvements=None,
        )

        # Return the saved record + the structured data for the UI
        payload = fb.dict()
        payload["structured"] = structured
        return ok(payload, 201)

    except Exception as e:
        return bad_request(f"Feedback generation failed: {str(e)}")

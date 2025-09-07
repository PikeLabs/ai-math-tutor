import json
from flask import Blueprint, request

from utils.http import ok, bad_request
from utils.parsing import parse_int
from utils.decorators import require_json

from services.database_service import (
    save_feedback,
    get_latest_feedback_for_session,
)
from services.feedback_service import generate_feedback
from services.media_service import get_presigned_slide_urls


def _enrich_with_presigned_urls(structured: dict) -> dict:
    """
    Return a copy with transient presigned URLs injected per slide.
    Uses:
      - structured['pdf_session_id'] for images
      - structured['session_id'] for audio segments
    """
    if not structured or not isinstance(structured, dict):
        return structured

    data = json.loads(json.dumps(structured))  # cheap deep copy

    image_session_id = data.get("pdf_session_id") or data.get("session_id")
    audio_session_id = data.get("session_id")

    for s in data.get("slides", []):
        num = s.get("slide_number")
        if not isinstance(num, int):
            continue

        # Images
        if image_session_id:
            img = get_presigned_slide_urls(image_session_id, num)
            s["image_url"] = img.get("thumb")
            s["image_url_full"] = img.get("full")

        # Audio
        if audio_session_id:
            aud = get_presigned_slide_urls(audio_session_id, num)
            s["audio_url"] = aud.get("audio")
            s["audio_mime"] = aud.get("audio_mime")

    return data


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


# TODO: This doesn't need to return anything anymore...
# TODO: This should handle cleanup, not the front end...
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
                messages_str = request.form.get("messages")
                # messages = (messages and __import__("json").loads(messages)) or []
                messages = json.loads(messages_str) if messages_str else []
            except Exception:
                messages = []

            slide_timestamps_raw = request.form.get("slideTimestamps")
            qa_timestamps_raw = request.form.get("qaTimestamps")

            try:
                slide_timestamps = (
                    json.loads(slide_timestamps_raw) if slide_timestamps_raw else None
                )
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

            recording = request.files.get("recording")  # may be None
            pdf_session_id = request.form.get("pdfSessionId") or None
        else:
            # json
            data = request.get_json(silent=True) or {}
            session_id = data.get("sessionId")
            if not session_id:
                return bad_request("sessionId is required")

            messages = data.get("messages") or []
            slide_timestamps = data.get("slideTimestamps") or None
            qa_timestamps = data.get("qaTimestamps") or None
            recording = None  # only via multipart
            pdf_session_id = data.get("pdfSessionId") or None

        # --- Call generator ---
        structured = generate_feedback(
            conversation_history=messages,
            slide_content=None,  # you can pass actual slide text if you have it
            presentation_recording=recording,
            slide_timestamps=slide_timestamps,
            pdf_session_id=pdf_session_id,
            pdf_slide_count=None,
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
        fb = save_feedback(
            session_id=session_id,
            overall_feedback=overall_text[:2000],  # guard length if desired
            presentation_score=None,  # you can compute a score later if needed
            slide_feedback=json.dumps(structured),
            strengths=None,
            improvements=None,
        )

        # Return the saved record + the structured data for the UI
        payload = fb.dict()
        payload["structured"] = structured
        return ok(payload, 201)

    except Exception as e:
        return bad_request(f"Feedback generation failed: {str(e)}")


@bp.get("/feedback/<string:session_id>")
def api_get_feedback(session_id):
    """
    Return the latest saved feedback row for a session, including structured JSON.
    This is student-facing and does not require professor auth.
    """
    if not session_id:
        return bad_request("sessionId is required")

    def _empty_feedback():
        return {
            "feedback": {
                "feedback_type": "legacy",
                "slides": [],
                "qa_feedback": None,
                "legacy_text": None,
                "metadata": {"has_audio": False, "has_conversation": False},
            }
        }

    try:
        fb_row = get_latest_feedback_for_session(session_id)

        if not fb_row:
            return ok(_empty_feedback())

        try:
            structured = (
                json.loads(fb_row.slideFeedback) if fb_row.slideFeedback else None
            )
        except Exception:
            structured = None

        if structured:
            enriched = _enrich_with_presigned_urls(structured)
            return ok({"feedback": enriched})

        return ok(_empty_feedback())

    except Exception as e:
        return bad_request(f"Fetch feedback failed: {str(e)}")

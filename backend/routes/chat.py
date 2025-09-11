import json, os, tempfile
from flask import Blueprint, request

from utils.http import ok, bad_request, internal_error
from services.ai_service import chat_with_ai, transcribe_audio
from services.database_service import add_conversation
from utils.pdf_utils import get_assignment_text


bp = Blueprint("chat", __name__)


def _process_chat_request(
    *,
    messages,
    session_id: str | None,
    selected_assignment: str | None,
    slide_number: int | None,
    timestamp: str | None,
    audio_transcription: str | None,
    persist: bool = True,
):
    """
    Shared chat flow:
      1) validate inputs
      2) persist student's message (+ transcription if present)
      3) run AI with optional PDF context + transcription
      4) persist assistant reply
      5) return (payload, error_message)
    """

    # --- Validate ---
    if not isinstance(messages, list) or not messages:
        return None, "Messages (array) are required"
    if not session_id:
        return None, "sessionId is required"

    slide_number_int = int(slide_number) if (slide_number not in (None, "")) else None

    # --- Persist student's message (with transcription appended if present) ---
    last_user = next(
        (m for m in reversed(messages) if m.get("role") in ("user", "student")),
        None,
    )
    student_text = (last_user or {}).get("content", "") or ""

    if "[SLIDE_CONTEXT]" in student_text or "CONTEXT:" in student_text:
        student_text = ""

    if audio_transcription:
        # keep it simple for MVP; append transcription as a block
        student_text = (
            f"{student_text}\n\n[Transcription]\n{audio_transcription}".strip()
        )

    if persist:
        try:
            if student_text:
                add_conversation(
                    session_id=session_id,
                    role="student",
                    content=student_text,
                    slide_number=slide_number_int,
                    timestamp=timestamp,  # FE sends ISO string; DB layer normalizes
                )
        except Exception as e:
            return None, f"Chat failed to log student message: {e}"

    # --- AI call with optional PDF context ---
    try:
        pdf_context = (
            get_assignment_text(selected_assignment) if selected_assignment else None
        )
        ai_text = chat_with_ai(messages, pdf_context, audio_transcription)
    except Exception as e:
        return None, f"Chat AI generation failed: {e}"

    # --- Persist assistant reply ---
    if persist:
        try:
            if ai_text:
                add_conversation(
                    session_id=session_id,
                    role="assistant",
                    content=ai_text,
                    slide_number=slide_number_int,
                    timestamp=None,
                )
        except Exception as e:
            return None, f"Failed to log assistant reply: {e}"

    return {"response": ai_text}, None


@bp.post("/chat")
def chat_json():
    """
    JSON-only chat endpoint.
    Body: {
      sessionId: string,
      messages: Array<{role, content}>,
      selectedAssignment?: string,   # filename in assignments/
      slideNumber?: number | string,
      timestamp?: string,
      persist?: boolean
    }
    """

    try:
        data = request.get_json(force=True) or {}
        messages = data.get("messages", [])
        selected_assignment = data.get("selectedAssignment")
        session_id = data.get("sessionId")
        slide_number = data.get("slideNumber")
        timestamp = data.get("timestamp")
        persist = request.args.get("persist", "1") in ("1", "true", "True")

        payload, error = _process_chat_request(
            messages=messages,
            session_id=session_id,
            selected_assignment=selected_assignment,
            slide_number=slide_number,
            timestamp=timestamp,
            audio_transcription=None,
            persist=persist,
        )

        if error:
            return bad_request(error)

        return ok(payload)

    except Exception as e:
        print("/api/chat failed:", e)
        return internal_error(f"Chat error: {e}")


@bp.post("/chat/audio")
def chat_audio():
    """
    Multipart chat endpoint (accepts audio).
    Form fields:
      - messages: JSON string (Array<{role, content}>)
      - selectedAssignment?: string
      - sessionId: string
      - slideNumber?: string|number
      - timestamp?: string
      - audio: file (optional but expected for this route)
    """
    try:
        if not (request.content_type and "multipart/form-data" in request.content_type):
            return bad_request("Content-Type must be multipart/form-data")

        messages_json = request.form.get("messages")
        if not messages_json:
            return bad_request("messages is required")

        try:
            messages = json.loads(messages_json)
        except Exception:
            return bad_request("Invalid messages JSON")

        session_id = request.form.get("sessionId")
        selected_assignment = request.form.get("selectedAssignment")
        slide_number = request.form.get("slideNumber")
        timestamp = request.form.get("timestamp")
        persist = request.args.get("persist", "0") in ("1", "true", "True")

        # Transcribe if audio present
        audio_transcription = None
        audio_file = request.files.get("audio")

        if audio_file and audio_file.filename:
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".webm"
            ) as temp_audio:
                audio_file.save(temp_audio.name)
                try:
                    audio_transcription = transcribe_audio(temp_audio.name)
                finally:
                    os.unlink(temp_audio.name)

        payload, error = _process_chat_request(
            messages=messages,
            session_id=session_id,
            selected_assignment=selected_assignment,
            slide_number=slide_number,
            timestamp=timestamp,
            audio_transcription=audio_transcription,
            persist=persist,
        )

        if error:
            return bad_request(error)
        return ok(payload)

    except Exception as e:
        print("chat-audio (multipart) failed:", e)
        return bad_request(f"/chat-audio failed: {e}")

import json, os, tempfile
from flask import Blueprint, request, jsonify
from utils.http import ok, bad_request
from services.ai_service import chat_with_ai, transcribe_audio
from services.database_service import add_conversation
from pdf_utils import get_assignment_text

bp = Blueprint("chat", __name__, url_prefix="/api/v1")


# TODO: Let's break this into seperate endpoints on /chat for better clarity.
@bp.post("/chat")
def chat():
    try:
        is_multipart = (
            request.content_type and "multipart/form-data" in request.content_type
        )

        if is_multipart:
            messages_json = request.form.get("messages")
            if not messages_json:
                return bad_request("Messages are required")
            messages = json.loads(messages_json)

            selected_assignment = request.form.get("selectedAssignment")
            session_id = request.form.get("sessionId")
            slide_number = request.form.get("slideNumber")
            timestamp = request.form.get("timestamp")

            audio_transcription = None
            if "audio" in request.files:
                audio_file = request.files["audio"]
                if audio_file and audio_file.filename:
                    with tempfile.NamedTemporaryFile(
                        delete=False, suffix=".wav"
                    ) as tmp:
                        audio_file.save(tmp.name)
                        try:
                            audio_transcription = transcribe_audio(tmp.name)
                        finally:
                            os.unlink(tmp.name)
        else:
            data = request.get_json(force=True)
            messages = data.get("messages", [])
            selected_assignment = data.get("selectedAssignment")
            session_id = data.get("sessionId")
            slide_number = data.get("slideNumber")
            timestamp = data.get("timestamp")
            audio_transcription = None

        if not isinstance(messages, list) or not messages:
            return bad_request("Messages (array) are required")
        if not session_id:
            return bad_request("sessionId is required")

        try:
            slide_number_int = (
                int(slide_number) if slide_number not in (None, "") else None
            )
        except Exception:
            slide_number_int = None

        last_user = next(
            (m for m in reversed(messages) if m.get("role") in ("user", "student")),
            None,
        )
        student_text = (last_user or {}).get("content", "") or ""

        if audio_transcription:
            student_text = (
                f"{student_text}\n\n[Transcription]\n{audio_transcription}".strip()
            )

        if student_text:
            add_conversation(
                session_id=session_id,
                role="student",
                content=student_text,
                slide_number=slide_number_int,
                timestamp=timestamp,
            )

        pdf_context = (
            get_assignment_text(selected_assignment) if selected_assignment else None
        )
        ai_text = chat_with_ai(messages, pdf_context, audio_transcription)

        if ai_text:
            add_conversation(
                session_id=session_id,
                role="assistant",
                content=ai_text,
                slide_number=slide_number_int,
                timestamp=None,
            )

        return jsonify({"response": ai_text})

    except Exception as e:
        print("/api/chat failed:", e)
        return jsonify({"error": str(e)}), 500

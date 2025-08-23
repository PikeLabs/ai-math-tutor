import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from services.db import connect_db, disconnect_db
# from services.database_service import (
#     create_student,
#     create_session,
#     update_session,
#     list_sessions,
#     get_session,
#     save_feedback,
#     add_conversation,
#     add_conversations_bulk,
# )
# from services.ai_service import chat_with_ai, transcribe_audio
# from pdf_utils import get_assignment_text, get_assignment_slides_range
# from backend.services.feedback_service import generate_feedback
# from backend.services.pdf_image_service import (
    # get_slide_image_path,
    # save_slide_images,
    # cleanup_old_sessions,
# )
# from backend.services.feedback_service import get_audio_segment_path, cleanup_old_audio_sessions
# from helpers.request_helpers import bad_request, not_found, ok, parse_int

from routes.health import bp as health_bp
from routes.sessions import bp as sessions_bp
from routes.conversations import bp as conversations_bp
# from routes.professor import bp as professor_bp
from routes.feedback import bp as feedback_api_bp
from routes.chat import bp as chat_bp
from routes.assignments import bp as assignments_bp
from routes.media import bp as media_bp
from routes.uploads import bp as uploads_bp


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# app = Flask(__name__)
# CORS(app, origins=["http://localhost:3000"])

def create_app():
    app = Flask(__name__)
    CORS(app, origins=["http://localhost:3000"])

    @app.before_request
    def _connect():
        connect_db()

    # @app.teardown_appcontext
    # def shutdown_session(exception=None):
    #     disconnect_db()
    @app.teardown_appcontext
    def _disconnect(exception=None):
        disconnect_db()

    # Register blueprints (all are url_prefix="/api" except health)
    app.register_blueprint(health_bp)
    app.register_blueprint(sessions_bp)
    app.register_blueprint(conversations_bp)
    # app.register_blueprint(professor_bp)
    app.register_blueprint(feedback_api_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(assignments_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(uploads_bp)

    return app


# @app.get("/api/health")
# def health():
#     return {
#         "ok": True,
#         "env": os.environ.get("FLASK_ENV", "development"),
#     }


# # --- SESSIONS ---
# # TODO: Complete API endpoints for session management
# @app.post("/api/session/create")
# def api_create_session():
#     """
#     Body: { studentName: string, slideCount?: number, pdfUrl?: string }
#     Resp: { sessionId, studentId }
#     """
#     data = request.get_json(silent=True) or {}
#     name = (data.get("studentName") or "").strip()
#     if len(name) < 2:
#         return bad_request("studentName (min 2 chars) is required")

#     try:
#         slide_count = parse_int(data.get("slideCount"), "slideCount")
#     except ValueError as e:
#         return bad_request(str(e))

#     pdf_url = data.get("pdfUrl")
#     student = create_student(name)
#     sess = create_session(student.id, slide_count, pdf_url)
#     return ok({"sessionId": sess.id, "studentId": student.id}, 201)


# # ---------- student app can patch session metadata (slide count, status, pdfUrl) ----------
# @app.patch("/api/session/<session_id>")
# def api_patch_session(session_id: str):
#     """
#     Body: { slideCount?: number, status?: string, pdfUrl?: string, completedAt?: ISO }
#     """
#     data = request.get_json(silent=True) or {}
#     payload = {}
#     if "slideCount" in data:
#         try:
#             payload["slideCount"] = parse_int(data["slideCount"], "slideCount")
#         except ValueError as e:
#             return bad_request(str(e))
#     if "status" in data:
#         payload["status"] = data["status"]
#     if "pdfUrl" in data:
#         payload["pdfUrl"] = data["pdfUrl"]
#     if "completedAt" in data:
#         payload["completedAt"] = data["completedAt"]  # ISO string

#     if not payload:
#         return bad_request("No updatable fields provided")
#     updated = update_session(session_id, payload)
#     return ok(updated.dict())


# # ---------- log conversation turns (store chat/audio transcript) ----------
# @app.post("/api/session/<session_id>/conversations")
# def api_add_conversations(session_id: str):
#     """
#     Body (either form is accepted):
#       { role, content, slideNumber?, timestamp }  // single
#       { items: [ { sessionId?, role, content, slideNumber?, timestamp }, ... ] }  // bulk
#     """
#     data = request.get_json(silent=True) or {}

#     # Bulk path
#     if "items" in data and isinstance(data["items"], list):
#         items = []
#         for it in data["items"]:
#             role = (it.get("role") or "").strip()
#             content = (it.get("content") or "").strip()
#             if not role or not content:
#                 return bad_request("Each item requires role and content")
#             items.append(
#                 {
#                     "sessionId": it.get("sessionId") or session_id,
#                     "role": role,
#                     "content": content,
#                     "slideNumber": it.get("slideNumber"),
#                     "timestamp": it.get("timestamp") or it.get("time") or it.get("ts"),
#                 }
#             )
#         res = add_conversations_bulk(items)
#         return ok({"count": res.count}, 201)

#     # Single path
#     role = (data.get("role") or "").strip()
#     content = (data.get("content") or "").strip()
#     if not role or not content:
#         return bad_request("role and content are required")
#     conv = add_conversation(
#         session_id=session_id,
#         role=role,
#         content=content,
#         slide_number=data.get("slideNumber"),
#         timestamp=data.get("timestamp") or data.get("time") or data.get("ts"),
#     )
#     return ok(conv.dict(), 201)


# # ---------- professor list & details ----------
# @app.get("/api/professor/sessions")
# def api_list_sessions_route():
#     rows = list_sessions()
#     # very basic query params for FE convenience
#     q = (request.args.get("q") or "").lower().strip()
#     if q:
#         rows = [r for r in rows if r.student and q in r.student.name.lower()]
#     return ok([r.dict() for r in rows])


# @app.get("/api/professor/session/<session_id>")
# def api_get_session_route(session_id: str):
#     s = get_session(session_id)
#     if not s:
#         return not_found()
#     return ok(s.dict())


# # --------- Feedback ---------# ---------- persist feedback (immediately after generating on FE) ----------
# @app.post("/api/feedback")
# def api_save_feedback_route():
#     """
#     Body: {
#       sessionId: number, overallFeedback: string,
#       presentationScore?: number, slideFeedback?: string,
#       strengths?: string, improvements?: string
#     }
#     """
#     data = request.get_json(silent=True) or {}
#     session_id = data.get("sessionId")

#     if "sessionId" not in data or not session_id:
#         return bad_request("sessionId is required")

#     try:
#         score = parse_int(data.get("presentationScore"), "presentationScore")
#     except ValueError as e:
#         return bad_request(str(e))

#     fb = save_feedback(
#         session_id=session_id,
#         overall_feedback=data.get("overallFeedback", "") or "",
#         presentation_score=score,
#         slide_feedback=data.get("slideFeedback"),
#         strengths=data.get("strengths"),
#         improvements=data.get("improvements"),
#     )
#     return ok(fb.dict(), 201)


# # --------- Optional: mark feedback reviewed ---------
# # @app.put("/api/session/<int:session_id>/reviewed")
# # def api_mark_reviewed(session_id: int):
# #     """
# #     Marks a session's feedback as 'viewedByProfessor'
# #     """
# #     from services.db import db

# #     s = get_session(session_id)
# #     if not s:
# #         return not_found()

# #     # if no feedback yet, create a minimal record (or return 400)
# #     if not s.feedback:
# #         fb = db.feedback.create(
# #             {
# #                 "data": {
# #                     "sessionId": session_id,
# #                     "overallFeedback": "",
# #                     "presentationScore": None,
# #                     "viewedByProfessor": True,
# #                     "viewedAt": db.raw(
# #                         "NOW()"
# #                     ),  # Prisma Python supports raw for simple SQL, or set in code
# #                 }
# #             }
# #         )
# #         return ok(fb.dict())

# #     fb = db.feedback.update(
# #         {
# #             "where": {"id": s.feedback.id},
# #             "data": {"viewedByProfessor": True, "viewedAt": db.raw("NOW()")},
# #         }
# #     )
# #     return ok(fb.dict())


# # TODO: Let's break this into seperate endpoints on /chat for better clarity.
# @app.post("/api/chat")
# def chat():
#     """
#     Persists the student turn (and transcription if present), calls the AI,
#     then persists the assistant turn. Returns AI text.

#     Expected fields:
#       - messages: array (JSON or form field with JSON string)
#       - selectedAssignment: optional
#       - sessionId: required
#       - slideNumber: optional
#       - timestamp: optional ISO string
#       - audio: optional file (multipart only)
#     """
#     try:
#         print("🌐 API /chat endpoint called")
#         is_multipart = (
#             request.content_type and "multipart/form-data" in request.content_type
#         )

#         # ---- Parse inputs ----
#         if is_multipart:
#             import json, tempfile, os

#             messages_json = request.form.get("messages")
#             if not messages_json:
#                 return jsonify({"error": "Messages are required"}), 400
#             messages = json.loads(messages_json)

#             selected_assignment = request.form.get("selectedAssignment")
#             session_id = request.form.get("sessionId")  # REQUIRED
#             slide_number = request.form.get("slideNumber")
#             timestamp = request.form.get("timestamp")

#             audio_transcription = None
#             if "audio" in request.files:
#                 audio_file = request.files["audio"]
#                 if audio_file and audio_file.filename:
#                     with tempfile.NamedTemporaryFile(
#                         delete=False, suffix=".wav"
#                     ) as tmp:
#                         audio_file.save(tmp.name)
#                         try:
#                             audio_transcription = transcribe_audio(tmp.name)
#                         finally:
#                             os.unlink(tmp.name)
#         else:
#             data = request.get_json(force=True)
#             messages = data.get("messages", [])
#             selected_assignment = data.get("selectedAssignment")
#             session_id = data.get("sessionId")  # REQUIRED
#             slide_number = data.get("slideNumber")
#             timestamp = data.get("timestamp")
#             audio_transcription = None

#         # ---- Validate inputs ----
#         if not isinstance(messages, list) or not messages:
#             return jsonify({"error": "Messages (array) are required"}), 400
#         if not session_id:
#             return jsonify({"error": "sessionId is required"}), 400

#         # Normalize slide number to int or None
#         try:
#             slide_number_int = (
#                 int(slide_number)
#                 if slide_number
#                 not in (
#                     None,
#                     "",
#                 )
#                 else None
#             )
#         except Exception:
#             slide_number_int = None

#         # ---- Persist student turn (last message) ----
#         last_user = next(
#             (m for m in reversed(messages) if m.get("role") in ("user", "student")),
#             None,
#         )
#         student_text = (last_user or {}).get("content", "")
#         if audio_transcription:
#             student_text = (
#                 f"{student_text}\n\n[Transcription]\n{audio_transcription}".strip()
#             )

#         if student_text:
#             add_conversation(
#                 session_id=session_id,
#                 role="student",
#                 content=student_text,
#                 slide_number=slide_number_int,
#                 timestamp=timestamp,  # handled safely in database_service
#             )

#         # ---- Optional PDF context ----
#         pdf_context = (
#             get_assignment_text(selected_assignment) if selected_assignment else None
#         )

#         # ---- Call AI service ----
#         ai_text = chat_with_ai(messages, pdf_context, audio_transcription)

#         # ---- Persist assistant turn ----
#         if ai_text:
#             add_conversation(
#                 session_id=session_id,
#                 role="assistant",
#                 content=ai_text,
#                 slide_number=slide_number_int,
#                 timestamp=None,
#             )

#         return jsonify({"response": ai_text})

#     except Exception as e:
#         print("❌ /api/chat failed:", e)
#         return jsonify({"error": str(e)}), 500


# @app.put("/api/session/<session_id>/reviewed")
# def api_mark_reviewed(session_id: str):
#     """
#     Marks a session's feedback as 'viewedByProfessor'.
#     If feedback doesn't exist yet, creates a minimal record and marks it reviewed.
#     """
#     from services.db import db

#     s = get_session(session_id)
#     if not s:
#         return not_found()

#     now = db.raw("NOW()")
#     if not s.feedback:
#         fb = db.feedback.create(
#             {
#                 "data": {
#                     "sessionId": session_id,
#                     "overallFeedback": "",
#                     "presentationScore": None,
#                     "viewedByProfessor": True,
#                     "viewedAt": now,
#                 }
#             }
#         )
#         return ok(fb.dict())

#     fb = db.feedback.update(
#         {
#             "where": {"id": s.feedback.id},
#             "data": {"viewedByProfessor": True, "viewedAt": now},
#         }
#     )
#     return ok(fb.dict())


# NOTE: This was commented out before I commented out everything...
# TODO: Remove the commented-out chat function once the new one is tested more completely.
# @app.route("/api/chat", methods=["POST"])
# def chat():
#     try:
#         print("🌐 API /chat endpoint called")
#         print(f"📋 Content-Type: {request.content_type}")

#         # Check if this is a multipart request (with audio file)
#         if request.content_type and "multipart/form-data" in request.content_type:
#             print("🎵 Multipart request detected - checking for audio...")

#             # Handle multipart request with audio
#             messages_json = request.form.get("messages")
#             if not messages_json:
#                 return jsonify({"error": "Messages are required"}), 400

#             import json

#             messages = json.loads(messages_json)
#             selected_assignment = request.form.get("selectedAssignment")

#             # Handle audio file if present
#             audio_transcription = None
#             if "audio" in request.files:
#                 audio_file = request.files["audio"]
#                 print(f"🎙️ Audio file received: {audio_file.filename}")
#                 print(f"📏 Audio file size: {audio_file.content_length} bytes")

#                 if audio_file and audio_file.filename:
#                     # Save audio file temporarily
#                     with tempfile.NamedTemporaryFile(
#                         delete=False, suffix=".wav"
#                     ) as temp_audio:
#                         audio_file.save(temp_audio.name)
#                         print(f"💾 Audio saved to temporary file: {temp_audio.name}")

#                         try:
#                             # Transcribe audio
#                             print("🔊 Starting audio transcription with Whisper...")
#                             audio_transcription = transcribe_audio(temp_audio.name)
#                             print(f"✅ Audio transcription successful!")
#                             print(f"📝 Transcription: {audio_transcription}")
#                         except Exception as transcribe_error:
#                             print(f"❌ Transcription failed: {transcribe_error}")
#                         finally:
#                             # Clean up temporary file
#                             os.unlink(temp_audio.name)
#                             print("🗑️ Temporary audio file cleaned up")
#             else:
#                 print("⚠️ No audio file found in multipart request")

#         else:
#             # Handle regular JSON request
#             data = request.get_json()
#             messages = data.get("messages", [])
#             selected_assignment = data.get("selectedAssignment")
#             audio_transcription = None

#             if not messages:
#                 return jsonify({"error": "Messages are required"}), 400

#         # Extract PDF context if assignment is selected
#         pdf_context = None
#         if selected_assignment:
#             pdf_context = get_assignment_text(selected_assignment)

#         ai_response = chat_with_ai(messages, pdf_context, audio_transcription)

#         # Return simple response for entrepreneurship mentoring
#         return jsonify({"response": ai_response})

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/assignments", methods=["GET"])
# def get_assignments():
#     try:
#         assignments_dir = os.path.join(os.path.dirname(__file__), "assignments")

#         if not os.path.exists(assignments_dir):
#             return jsonify({"assignments": []}), 200

#         pdf_files = []
#         for filename in os.listdir(assignments_dir):
#             if filename.endswith(".pdf"):
#                 pdf_files.append(
#                     {
#                         "filename": filename,
#                         "displayName": filename.replace(".pdf", "")
#                         .replace("_", " ")
#                         .title(),
#                     }
#                 )

#         return jsonify({"assignments": pdf_files})

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/assignments/<filename>", methods=["GET"])
# def get_assignment_file(filename):
#     try:
#         assignments_dir = os.path.join(os.path.dirname(__file__), "assignments")
#         file_path = os.path.join(assignments_dir, filename)

#         if not os.path.exists(file_path) or not filename.endswith(".pdf"):
#             return jsonify({"error": "File not found"}), 404

#         return send_file(file_path, mimetype="application/pdf")

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/assignments/<filename>/slides", methods=["POST"])
# def get_assignment_slides(filename):
#     try:
#         data = request.get_json()
#         start_slide = data.get("start_slide")
#         end_slide = data.get("end_slide")

#         if not start_slide or not end_slide:
#             return jsonify({"error": "start_slide and end_slide are required"}), 400

#         slide_content = get_assignment_slides_range(filename, start_slide, end_slide)
#         full_content = get_assignment_text(filename)

#         if slide_content is None:
#             return jsonify({"error": "Could not extract slide content"}), 404

#         return jsonify(
#             {
#                 "slide_range": f"{start_slide}-{end_slide}",
#                 "focused_content": slide_content,
#                 "full_content": full_content,
#             }
#         )

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/feedback/test", methods=["GET"])
# def test_feedback():
#     # Simple test endpoint to check if feedback storage works
#     test_feedback = 'Content structuring: Met: No - Your presentation lacks a clear logical flow, with slides 3-4 containing weak problem statements that fail to establish urgency; reorder to: hook, specific problem, solution, evidence, ask; replace vague "people struggle with productivity" with "73% of remote workers report missing critical project deadlines due to notification overload." Delivery: Met: No - You used filler words approximately 1 every 6 seconds ("um", "like", "you know"), spoke too quickly at 180+ WPM during solution explanation, and your voice trailed off when discussing market size; practice this script: "Our AI assistant reduces notification interruptions by 60% through smart priority filtering." Impromptu response: Met: No - When asked about customer acquisition cost, you deflected with "we\'re still figuring that out" instead of providing pilot data; required evidence: specific CAC from beta users, conversion rates, or comparable SaaS benchmarks; model answer: "Our pilot shows $45 CAC through LinkedIn outreach, with 12% free-to-paid conversion matching industry averages for productivity tools." Composure: Met: No - When challenged on market differentiation, you became defensive ("that\'s not really fair to say") and meandered for 45 seconds without addressing the core concern; replacement response: "You\'re right to question differentiation - here\'s our unique moat: real-time learning from user behavior patterns." Next time, do this first: lead with one concrete customer pain point and specific metric.'
#     return jsonify({"feedback": test_feedback})


# @app.route("/api/feedback", methods=["POST"])
# def generate_pitch_feedback():
#     try:
#         print("📝 API /feedback endpoint called")
#         print(f"📋 Content-Type: {request.content_type}")

#         # Check if this is a multipart request (with recording)
#         if request.content_type and "multipart/form-data" in request.content_type:
#             print("🎵 Multipart request with recording detected...")

#             # Get conversation history and other data
#             messages_json = request.form.get("messages")
#             if not messages_json:
#                 return jsonify({"error": "Messages are required for feedback"}), 400

#             import json

#             conversation_history = json.loads(messages_json)
#             print(f"📝 Received {len(conversation_history)} messages in conversation")
#             print(
#                 f"📝 Messages types: {[msg.get('role') for msg in conversation_history[:5]]}"
#             )
#             selected_assignment = request.form.get("selectedAssignment")
#             pdf_session_id = request.form.get("pdfSessionId")

#             # Get slide timestamps if provided
#             slide_timestamps = []
#             timestamps_json = request.form.get("slideTimestamps")
#             if timestamps_json:
#                 try:
#                     slide_timestamps = json.loads(timestamps_json)
#                     print(f"📊 Slide timestamps received: {slide_timestamps}")
#                 except json.JSONDecodeError:
#                     print("⚠️ Failed to parse slide timestamps")

#             # Get actual slide count if provided
#             pdf_slide_count = request.form.get("pdfSlideCount")
#             if pdf_slide_count:
#                 try:
#                     pdf_slide_count = int(pdf_slide_count)
#                     print(f"📄 PDF slide count received: {pdf_slide_count}")
#                 except:
#                     pdf_slide_count = None

#             print(f"📄 PDF session ID received: {pdf_session_id}")

#             # Get slide content if assignment is selected
#             slide_content = None
#             if selected_assignment:
#                 slide_content = get_assignment_text(selected_assignment)

#             # Handle recording file if present
#             presentation_recording = None
#             if "recording" in request.files:
#                 recording_file = request.files["recording"]
#                 print(f"🎙️ Recording file received: {recording_file.filename}")

#                 if recording_file and recording_file.filename:
#                     presentation_recording = recording_file

#             # Generate feedback
#             feedback_data = generate_feedback(
#                 conversation_history=conversation_history,
#                 slide_content=slide_content,
#                 presentation_recording=presentation_recording,
#                 slide_timestamps=slide_timestamps,
#                 assignment_filename=selected_assignment,
#                 pdf_session_id=pdf_session_id,
#                 pdf_slide_count=pdf_slide_count,
#             )

#         else:
#             # Handle regular JSON request without recording
#             data = request.get_json()
#             conversation_history = data.get("messages", [])
#             selected_assignment = data.get("selectedAssignment")
#             pdf_session_id = data.get("pdfSessionId")
#             pdf_slide_count = data.get("pdfSlideCount")

#             print(f"📄 PDF session ID received (JSON): {pdf_session_id}")
#             print(f"📄 PDF slide count received (JSON): {pdf_slide_count}")

#             if not conversation_history:
#                 return jsonify({"error": "Messages are required for feedback"}), 400

#             # Get slide content if assignment is selected
#             slide_content = None
#             if selected_assignment:
#                 slide_content = get_assignment_text(selected_assignment)

#             # Parse slide count if it's a string
#             if pdf_slide_count:
#                 try:
#                     pdf_slide_count = int(pdf_slide_count)
#                 except:
#                     pdf_slide_count = None

#             # Generate feedback without recording
#             feedback_data = generate_feedback(
#                 conversation_history=conversation_history,
#                 slide_content=slide_content,
#                 presentation_recording=None,
#                 slide_timestamps=[],
#                 assignment_filename=selected_assignment,
#                 pdf_session_id=pdf_session_id,
#                 pdf_slide_count=pdf_slide_count,
#             )

#         return jsonify(feedback_data)

#     except Exception as e:
#         print(f"❌ Feedback generation failed: {str(e)}")
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/slide-image/<session_id>/<int:slide_number>", methods=["GET"])
# def get_slide_image(session_id, slide_number):
#     """Get slide image (thumbnail or full size)"""
#     try:
#         image_type = request.args.get("type", "thumbnail")  # 'thumbnail' or 'full'

#         print(
#             f"🖼️ Requesting slide image: session={session_id}, slide={slide_number}, type={image_type}"
#         )

#         image_path = get_slide_image_path(session_id, slide_number, image_type)

#         print(f"🖼️ Image path resolved to: {image_path}")

#         if not image_path or not os.path.exists(image_path):
#             print(f"❌ Image not found at path: {image_path}")
#             # List what files exist in the session directory for debugging
#             backend_dir = os.path.dirname(os.path.abspath(__file__))
#             session_dir = os.path.join(backend_dir, "slide_images", session_id)
#             if os.path.exists(session_dir):
#                 files = os.listdir(session_dir)
#                 print(f"📁 Files in session directory: {files}")
#             else:
#                 print(f"❌ Session directory does not exist: {session_dir}")
#             return jsonify({"error": "Slide image not found"}), 404

#         print(f"✅ Serving image from: {image_path}")
#         return send_file(image_path, mimetype="image/png")

#     except Exception as e:
#         print(f"❌ Error serving slide image: {str(e)}")
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/audio-segment/<session_id>/<int:slide_number>", methods=["GET"])
# def get_audio_segment(session_id, slide_number):
#     """Get audio segment for a specific slide"""
#     try:
#         print(
#             f"🎵 Requesting audio segment: session={session_id}, slide={slide_number}"
#         )

#         audio_path = get_audio_segment_path(session_id, slide_number)

#         print(f"🎵 Audio path resolved to: {audio_path}")

#         if not audio_path or not os.path.exists(audio_path):
#             print(f"❌ Audio not found at path: {audio_path}")
#             # List what files exist in the session directory for debugging
#             backend_dir = os.path.dirname(os.path.abspath(__file__))
#             session_dir = os.path.join(backend_dir, "audio_sessions", session_id)
#             if os.path.exists(session_dir):
#                 files = os.listdir(session_dir)
#                 print(f"📁 Files in audio session directory: {files}")
#             else:
#                 print(f"❌ Audio session directory does not exist: {session_dir}")
#             return jsonify({"error": "Audio segment not found"}), 404

#         print(f"✅ Serving audio from: {audio_path}")
#         return send_file(audio_path, mimetype="audio/wav")

#     except Exception as e:
#         print(f"❌ Error serving audio segment: {str(e)}")
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/process-upload", methods=["POST"])
# def process_upload():
#     """Process uploaded PDF to extract slide images"""
#     try:
#         if "file" not in request.files:
#             return jsonify({"error": "No file provided"}), 400

#         file = request.files["file"]
#         if not file.filename.endswith(".pdf"):
#             return jsonify({"error": "File must be a PDF"}), 400

#         # Generate session ID
#         import uuid

#         session_id = str(uuid.uuid4())

#         # Save uploaded file to assignments directory so VC system can access it
#         assignments_dir = os.path.join(os.path.dirname(__file__), "assignments")
#         os.makedirs(assignments_dir, exist_ok=True)

#         # Create unique filename to avoid conflicts
#         safe_filename = f"uploaded_{session_id}_{file.filename}"
#         permanent_pdf_path = os.path.join(assignments_dir, safe_filename)

#         # Save the uploaded file permanently
#         file.save(permanent_pdf_path)
#         print(f"📁 Saved uploaded PDF to: {permanent_pdf_path}")

#         # Extract slide images
#         slide_paths = save_slide_images(permanent_pdf_path, session_id)

#         # Get actual page count from PDF even if image processing fails
#         try:
#             import PyPDF2

#             with open(permanent_pdf_path, "rb") as pdf_file:
#                 pdf_reader = PyPDF2.PdfReader(pdf_file)
#                 actual_page_count = len(pdf_reader.pages)
#                 print(f"📄 Detected {actual_page_count} pages in PDF")
#         except:
#             # Fallback: try with react-pdf style detection or default
#             actual_page_count = len(slide_paths) if slide_paths else 4
#             print(f"⚠️ Could not detect page count, using: {actual_page_count}")

#         slide_count = len(slide_paths) if slide_paths else actual_page_count

#         return jsonify(
#             {
#                 "session_id": session_id,
#                 "slide_count": slide_count,
#                 "slides": (
#                     list(slide_paths.keys())
#                     if slide_paths
#                     else list(range(1, slide_count + 1))
#                 ),
#                 "filename": safe_filename,  # Return the filename for VC system
#                 "images_processed": bool(slide_paths),
#                 "message": "PDF uploaded successfully"
#                 + (
#                     " with slide images"
#                     if slide_paths
#                     else " (images unavailable - install poppler for slide images)"
#                 ),
#             }
#         )

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# @app.route("/api/cleanup", methods=["POST"])
# def cleanup_old_files():
#     """Manual cleanup of old files"""
#     try:
#         cleanup_old_sessions()
#         cleanup_old_audio_sessions()
#         return jsonify({"message": "Cleanup completed"})

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# if __name__ == "__main__":
#     # Run cleanup on startup
#     try:
#         cleanup_old_sessions()
#         cleanup_old_audio_sessions()
#     except:
#         pass

#     app.run(debug=True, host="0.0.0.0", port=5001)

if __name__ == "__main__":
    app = create_app()
    # Optional: run cleanup on startup (was in your __main__)

    try:
        from services.pdf_image_service import cleanup_old_sessions
        from services.feedback_service import cleanup_old_audio_sessions

        cleanup_old_sessions()
        cleanup_old_audio_sessions()
    except Exception:
        pass

    app.run(debug=True, host="0.0.0.0", port=5001)

from flask import Blueprint, request
from prisma.enums import SessionStatus
from services.database_service import (
    create_session,
    create_student,
    get_session_by_id,
    list_sessions,
    mark_feedback_reviewed,
    update_session,
)
from utils.http import ok, bad_request, not_found
from utils.parsing import parse_int, parse_iso_to_utc
from middleware.auth import professor_required
from config.paths import ASSIGNMENTS_DIR


bp = Blueprint("sessions", __name__)


@bp.post("/session/create")
def api_create_session():
    data = request.get_json(silent=True) or {}
    name = (data.get("studentName") or "").strip()

    if len(name) < 2:
        return bad_request("studentName (min 2 chars) is required")

    try:
        slide_count = parse_int(data.get("slideCount"), "slideCount")
    except ValueError as e:
        return bad_request(str(e))

    pdf_url = data.get("pdfUrl")

    # TODO: Student will be created when we implement auth...
    student = create_student(name)
    session = create_session(student.id, slide_count, pdf_url)

    return ok({"sessionId": session.id, "studentId": student.id}, 201)


@bp.patch("/session/<session_id>")
def api_patch_session(session_id: str):
    data = request.get_json(silent=True) or {}
    payload = {}

    if "slideCount" in data:
        try:
            payload["slideCount"] = parse_int(data["slideCount"], "slideCount")
        except ValueError as e:
            return bad_request(str(e))

    status = data.get("status")
    if status:
        valid = {s.value for s in SessionStatus}

    if "status" in data:
        status = str(data["status"]).strip()
        valid = {s.value for s in SessionStatus}
        if status not in valid:
            return bad_request(f"status must be one of {sorted(valid)}")
        payload["status"] = status

    if "pdfUrl" in data:
        val = (data["pdfUrl"] or "").strip()
        payload["pdfUrl"] = val or None

    if "completedAt" in data:
        payload["completedAt"] = (
            parse_iso_to_utc(data["completedAt"]) if data["completedAt"] else None
        )

    if not payload:
        return bad_request("No updatable fields provided")

    updated = update_session(session_id, payload)
    return ok(updated.dict())


@bp.get("/professor/sessions")
@professor_required
def api_list_sessions_route():
    rows = list_sessions()
    return ok([r.dict() for r in rows])


@bp.get("/professor/session/<session_id>")
@professor_required
def api_get_session_route(session_id: str):
    s = get_session_by_id(session_id)
    if not s:
        return not_found("Session not found")
    return ok(s.dict())


@bp.put("/professor/session/<session_id>/reviewed")
@professor_required
def api_mark_feedback_reviewed(session_id: str):
    data = request.get_json(silent=True) or {}
    reviewed = bool(data.get("reviewed", False))

    try:
        updated = mark_feedback_reviewed(session_id, reviewed)
    except Exception as e:
        return bad_request(str(e))

    return ok(updated.dict())

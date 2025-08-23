from flask import Blueprint, request
from utils.http import ok, bad_request, not_found
from utils.parsing import parse_int
from services.database_service import (
    create_student,
    create_session,
    update_session,
    get_session,
)


bp = Blueprint("sessions", __name__, url_prefix="/api/v1")


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

    if "status" in data:
        payload["status"] = data["status"]
    if "pdfUrl" in data:
        payload["pdfUrl"] = data["pdfUrl"]
    if "completedAt" in data:
        payload["completedAt"] = data["completedAt"]

    if not payload:
        return bad_request("No updatable fields provided")

    updated = update_session(session_id, payload)

    return ok(updated.dict())


@bp.get("/professor/session/<session_id>")
def api_get_session_route(session_id: str):
    s = get_session(session_id)
    if not s:
        return not_found()
    return ok(s.dict())

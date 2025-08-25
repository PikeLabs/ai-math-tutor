from flask import Blueprint, request
from utils.http import ok, bad_request, not_found
from utils.parsing import parse_int
from services.database_service import (
    create_session,
    create_student,
    list_sessions,
    get_session,
    update_session,
)


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


@bp.get("/professor/sessions")
def api_list_sessions_route():
    rows = list_sessions()
    # very basic query params for FE convenience
    q = (request.args.get("q") or "").lower().strip()
    if q:
        rows = [r for r in rows if r.student and q in r.student.name.lower()]
    return ok([r.dict() for r in rows])


@bp.get("/professor/session/<session_id>")
def api_get_session_route(session_id: str):
    s = get_session(session_id)
    if not s:
        return not_found()
    return ok(s.dict())

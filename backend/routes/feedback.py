from flask import Blueprint, request
from utils.http import ok, bad_request
from utils.parsing import parse_int
from utils.decorators import require_json
from services.database_service import save_feedback

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


# @bp.put("/session/<session_id>/reviewed")
# def api_mark_reviewed(session_id: str):
#     s = get_session(session_id)
#     if not s:
#         from utils.http import not_found

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

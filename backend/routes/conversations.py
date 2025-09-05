from flask import Blueprint, request

from utils.http import ok, bad_request
from services.database_service import add_conversation, add_conversations_bulk

bp = Blueprint("conversations", __name__)


@bp.post("/session/<session_id>/conversations")
def api_add_conversations(session_id: str):
    data = request.get_json(silent=True) or {}

    if "items" in data and isinstance(data["items"], list):
        items = []

        for it in data["items"]:
            role = (it.get("role") or "").strip()
            content = (it.get("content") or "").strip()

            if not role or not content:
                return bad_request("Each item requires role and content")
            items.append(
                {
                    "sessionId": it.get("sessionId") or session_id,
                    "role": role,
                    "content": content,
                    "slideNumber": it.get("slideNumber"),
                    "timestamp": it.get("timestamp") or it.get("time") or it.get("ts"),
                }
            )

        res = add_conversations_bulk(items)
        return ok({"count": res.count}, 201)

    role = (data.get("role") or "").strip()
    content = (data.get("content") or "").strip()

    if not role or not content:
        return bad_request("role and content are required")

    conv = add_conversation(
        session_id=session_id,
        role=role,
        content=content,
        slide_number=data.get("slideNumber"),
        timestamp=data.get("timestamp") or data.get("time") or data.get("ts"),
    )

    return ok(conv.dict(), 201)

from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone
from config.prisma import db
from utils.parsing import parse_iso_to_utc


# --- Students ---
# TODO: replace the “create student by name” shortcut with real auth + student context.
# For now it unblocks persistence.
def create_student(name: str):
    return db.student.create(data={"name": name})


# --- Sessions ---
def create_session(
    student_id: str,
    slide_count: Optional[int] = None,
    pdf_url: Optional[str] = None,
):
    return db.session.create(
        data={
            "studentId": student_id,
            "slideCount": slide_count,
            "pdfUrl": pdf_url,
            "status": "created",
        }
    )


def get_session_by_id(session_id: str):
    return db.session.find_unique(
        where={"id": session_id},
        include={
            "student": True,
            "feedback": True,
            "conversations": {
                "orderBy": {"timestamp": "asc"},
            },
        },
    )


def update_session(session_id: str, data: Dict[str, Any]):
    return db.session.update(where={"id": session_id}, data=data)


# fetch all student sessions with feedback
def list_sessions():
    rows = db.session.find_many(
        include={
            "student": True,  # brings Student model (or None)
            "feedback": True,  # brings Feedback model (or None)
        },
        order={"createdAt": "desc"},
    )

    trimmed = []
    for r in rows:
        stu = r.student
        fb = r.feedback

        trimmed.append(
            {
                "id": r.id,
                # If your JSON encoder can’t handle datetimes, use .isoformat():
                "createdAt": r.createdAt,  # or r.createdAt.isoformat()
                "completedAt": r.completedAt,  # or r.completedAt.isoformat() if not None
                "student": ({"id": stu.id, "name": stu.name} if stu else None),
                "feedback": {
                    "presentationScore": (fb.presentationScore if fb else None),
                },
                # Uncomment if you sort/filter by these in the UI:
                # "slideCount": r.slideCount,
                # "status": r.status,
            }
        )

    return trimmed


# --- Conversations ---
def add_conversation(
    session_id: str,
    role: str,
    content: str,
    slide_number: Optional[int] = None,
    timestamp: Optional[Union[str, datetime]] = None,
):
    ts: datetime
    if timestamp:
        try:
            ts = parse_iso_to_utc(timestamp)
        except Exception:
            raise ValueError(f"Invalid timestamp format: {timestamp}")
    else:
        ts = datetime.now(timezone.utc)

    return db.conversation.create(
        data={
            "sessionId": session_id,
            "role": role,
            "content": content,
            "slideNumber": slide_number,
            "timestamp": ts,
        }
    )


def add_conversations_bulk(items: List[Dict[str, Any]]):
    # Convert incoming items' timestamps to datetime in UTC
    normed = []
    for it in items:
        ts = it.get("timestamp")
        if ts:
            try:
                ts_norm = parse_iso_to_utc(ts)
            except Exception:
                ts_norm = datetime.now(timezone.utc)
        else:
            ts_norm = datetime.now(timezone.utc)

        normed.append(
            {
                "sessionId": it.get("sessionId"),
                "role": it.get("role"),
                "content": it.get("content"),
                "slideNumber": it.get("slideNumber"),
                "timestamp": ts_norm,
            }
        )

    return db.conversation.create_many(data=normed)


# --- Feedback ---
def save_feedback(
    session_id: str,
    overall_feedback: str,
    presentation_score: Optional[int] = None,
    slide_feedback: Optional[str] = None,
    strengths: Optional[str] = None,
    improvements: Optional[str] = None,
):
    """
    Create-or-update feedback by sessionId (manual upsert).
    Returns the DB model instance (with .dict()) like other helpers.
    """
    data = {
        "sessionId": session_id,
        "overallFeedback": overall_feedback,
        "presentationScore": presentation_score,
        "slideFeedback": slide_feedback,
        "strengths": strengths,
        "improvements": improvements,
    }

    # Try to locate existing feedback for this session
    existing = None
    try:
        existing = db.feedback.find_unique(where={"sessionId": session_id})
    except Exception:
        try:
            existing = db.feedback.find_first(where={"sessionId": session_id})
        except Exception:
            existing = None

    if existing:
        # Keep sessionId stable; update the rest
        update_data = {k: v for k, v in data.items() if k != "sessionId"}
        return db.feedback.update(where={"id": existing.id}, data=update_data)

    # No record yet → create
    return db.feedback.create(data=data)


def mark_feedback_reviewed(session_id: str, reviewed: bool):
    try:
        # Feedback.sessionId is unique; create if missing (so professor can mark first view)
        existing = db.feedback.find_unique(where={"sessionId": session_id})
        now = datetime.now(timezone.utc)

        if not existing:
            fb = db.feedback.create(
                {
                    "data": {
                        "sessionId": session_id,
                        "overallFeedback": "",
                        "presentationScore": None,
                        "viewedByProfessor": reviewed,
                        "viewedAt": now if reviewed else None,
                    }
                }
            )
            return fb

        fb = db.feedback.update(
            where={"id": existing.id},
            data={
                "viewedByProfessor": reviewed,
                "viewedAt": now if reviewed else None,
            },
        )
        return fb
    except Exception as e:
        raise e

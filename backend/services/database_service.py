from typing import Optional, List, Dict, Any, Union, Literal
from datetime import datetime, timezone
from prisma.enums import AssetKind

from config.prisma import get_db
from utils.parsing import parse_iso_to_utc


# --- Students ---
# TODO: replace the “create student by name” shortcut with real auth  student context.
# For now it unblocks persistence.
def create_student(name: str):
    db = get_db()
    return db.student.create(data={"name": name})


# --- Sessions ---
def create_session(
    student_id: str,
    slide_count: int | None = None,
    pdf_url: str | None = None,
):
    db = get_db()
    return db.session.create(
        data={
            "studentId": student_id,
            "slideCount": slide_count,
            "pdfUrl": pdf_url,
            "status": "created",
        }
    )


def update_session(session_id: str, data: Dict[str, Any]):
    db = get_db()
    return db.session.update(where={"id": session_id}, data=data)


def get_session_by_id(session_id: str):
    db = get_db()
    return db.session.find_unique(
        where={"id": session_id},
        include={
            "student": True,
            "feedback": True,
            "slideAssets": True,
            "conversations": {
                "orderBy": {"timestamp": "asc"},
            },
        },
    )


# fetch all student sessions with feedback
def list_sessions():
    db = get_db()
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
                # If fe JSON encoder can’t handle datetimes, use .isoformat():
                "createdAt": r.createdAt,  # or r.createdAt.isoformat()
                "completedAt": r.completedAt,  # or r.completedAt.isoformat() if not None
                "student": ({"id": stu.id, "name": stu.name} if stu else None),
                "feedback": {
                    "presentationScore": (fb.presentationScore if fb else None),
                },
                # "status": r.status,
            }
        )

    return trimmed


def get_latest_feedback_for_session(session_id: str):
    """
    Return the most recent feedback row for a session_id or None.
    """
    db = get_db()
    row = db.feedback.find_first(
        where={"sessionId": session_id},
        order={"createdAt": "desc"},
        include={
            "session": {
                "include": {
                    "conversations": True,
                    "slideAssets": True,
                }
            }
        },
    )

    return row


# --- Conversations ---
def add_conversation(
    session_id: str,
    role: str,
    content: str,
    slide_number: int | None = None,
    timestamp: Optional[Union[str, datetime]] = None,
):
    db = get_db()
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
    db = get_db()

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
    presentation_score: int | None = None,
    slide_feedback: str | None = None,
    strengths: str | None = None,
    improvements: str | None = None,
):
    """
    Create-or-update feedback by sessionId (manual upsert).
    Returns the DB model instance (with .dict()) like other helpers.
    """
    db = get_db()

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


def mark_feedback_reviewed(
    session_id: str,
    reviewed: bool,
):
    db = get_db()
    try:
        # Feedback.sessionId is unique; create if missing (so professor can mark first view)
        existing = db.feedback.find_unique(where={"sessionId": session_id})
        now = datetime.now(timezone.utc)

        if not existing:
            return db.feedback.create(
                data={
                    "sessionId": session_id,
                    "overallFeedback": "",
                    "presentationScore": None,
                    "viewedByProfessor": reviewed,
                    "viewedAt": now if reviewed else None,
                }
            )

        return db.feedback.update(
            where={"id": existing.id},
            data={
                "viewedByProfessor": reviewed,
                "viewedAt": now if reviewed else None,
            },
        )

    except Exception as e:
        raise e


# --- SlideAsset helpers ---
def _ensure_asset_type(
    kind: Literal["image_thumb", "image_full", "audio"],
) -> AssetKind:
    try:
        return AssetKind[kind]
    except KeyError:
        raise ValueError(f"Invalid asset kind: {kind}")


def upsert_slide_asset(
    *,
    session_id: str,
    slide_number: int,
    kind: Literal["image_thumb", "image_full", "audio"],
    s3_key: str,
    mime_type: str | None = None,
    size_bytes: int | None = None,
    duration_ms: int | None = None,
    width: int | None = None,
    height: int | None = None,
):
    """
    Create-or-replace a SlideAsset identified by (sessionId, slideNumber, kind).
    """
    db = get_db()

    file_kind = _ensure_asset_type(kind)

    # The schema has @@unique([sessionId, slideNumber, kind])
    existing = db.slideasset.find_first(
        where={"sessionId": session_id, "slideNumber": slide_number, "kind": file_kind}
    )

    data = {
        "sessionId": session_id,
        "slideNumber": slide_number,
        "kind": file_kind,
        "s3Key": s3_key,
        "mimeType": mime_type,
        "sizeBytes": size_bytes,
        "durationMs": duration_ms,
        "width": width,
        "height": height,
    }

    if existing:
        return db.slideasset.update(
            where={"id": existing.id},
            data=data,
        )

    return db.slideasset.create(data=data)


def list_slide_assets_for_session(session_id: str):
    db = get_db()

    return db.slideasset.find_many(
        where={"sessionId": session_id},
        order={"slideNumber": "asc"},
    )


def get_slide_asset(
    session_id: str,
    slide_number: int,
    kind: Literal["image_thumb", "image_full", "audio"],
):
    db = get_db()

    file_kind = _ensure_asset_type(kind)
    return db.slideasset.find_first(
        where={
            "sessionId": session_id,
            "slideNumber": slide_number,
            "kind": file_kind,
        }
    )

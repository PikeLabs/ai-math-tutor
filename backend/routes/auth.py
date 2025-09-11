import os
import bcrypt
from flask import Blueprint, request, session

from utils.http import bad_request, unauthorized, ok, internal_error

auth_bp = Blueprint(
    "auth_bp",
    __name__,
)


def _get_pw_hash():
    # bcrypt hash string from env
    return os.environ.get("PROFESSOR_PASSWORD_HASH", "")


@auth_bp.post("/auth/professor")
def login_professor():
    data = request.get_json(silent=True) or {}
    password = (data.get("password") or "").encode("utf-8")

    if not password:
        return bad_request("Password required")

    stored_pw_hash = _get_pw_hash().encode("utf-8")
    if not stored_pw_hash:
        return internal_error("Server auth not configured")

    pw = False
    try:
        pw = bcrypt.checkpw(password, stored_pw_hash)
    except Exception:
        pw = False

    if not pw:
        return unauthorized("Invalid credentials")

    session["is_professor"] = True
    payload = {"ok": True}

    return ok(payload)


@auth_bp.post("/auth/professor/logout")
def logout():
    session.pop("is_professor", None)
    return ok({"ok": True})


@auth_bp.get("/auth/professor/me")
def me():
    return ok({"isProfessor": bool(session.get("is_professor"))})

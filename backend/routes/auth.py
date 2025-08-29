from flask import Blueprint, request, jsonify, session
import os
import bcrypt


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
        return jsonify({"error": "Password required"}), 400

    stored_pw_hash = _get_pw_hash().encode("utf-8")
    if not stored_pw_hash:
        return jsonify({"error": "Server auth not configured"}), 500

    ok = False
    try:
        ok = bcrypt.checkpw(password, stored_pw_hash)
    except Exception:
        ok = False

    if not ok:
        return jsonify({"ok": False, "error": "Invalid credentials"}), 401

    session["is_professor"] = True
    return jsonify({"ok": True})


@auth_bp.post("/auth/professor/logout")
def logout():
    session.pop("is_professor", None)
    return jsonify({"ok": True})


@auth_bp.get("/auth/professor/me")
def me():
    return jsonify({"isProfessor": bool(session.get("is_professor"))})

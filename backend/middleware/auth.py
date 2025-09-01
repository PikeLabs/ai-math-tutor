from functools import wraps
from flask import session, jsonify


def professor_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_professor"):
            return jsonify({"error": "Auth required"}), 401
        return fn(*args, **kwargs)

    return wrapper

from functools import wraps
from flask import request, jsonify


def require_json(fn):
    """
    Decorator to ensure a request has a JSON body.
    Returns a 400 if content type is not application/json or body is missing.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return jsonify({"error": "Content-Type must be application/json"}), 400
        if not request.get_json(silent=True):
            return jsonify({"error": "Request body must be valid JSON"}), 400
        return fn(*args, **kwargs)

    return wrapper

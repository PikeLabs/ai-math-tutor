from functools import wraps
from flask import request
from utils.http import bad_request


def require_json(fn):
    """
    Decorator to ensure a request has a JSON body.
    Returns a 400 if content type is not application/json or body is missing.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not request.is_json:
            return bad_request("Content-Type must be application/json")
        if not request.get_json(silent=True):
            return bad_request("Request body must be valid JSON")
        return fn(*args, **kwargs)

    return wrapper

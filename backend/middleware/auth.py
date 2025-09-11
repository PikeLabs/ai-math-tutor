from functools import wraps
from flask import session
from utils.http import unauthorized


def professor_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        is_prof = bool(session.get("is_professor"))
        if not is_prof:
            return unauthorized("Authorization Required")
        return fn(*args, **kwargs)

    return wrapper

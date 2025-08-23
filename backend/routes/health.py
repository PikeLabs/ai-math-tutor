from flask import Blueprint

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    import os

    return {
        "ok": True,
        "env": os.getenv("FLASK_ENV", "development"),
    }

import os
from flask import Blueprint

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    import os
    from datetime import datetime, timezone

    environment = os.getenv("APP_ENV", "development")
    current_time = datetime.now(timezone.utc).isoformat()

    return {
        "ok": True,
        "time": current_time,
        "environment": environment,
        "status": "healthy"
    }

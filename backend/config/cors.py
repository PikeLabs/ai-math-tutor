import os
from flask import Flask


def _normalize_samesite(v: str) -> str:
    v = (v or "").strip().lower()
    if v in ("none", "lax", "strict"):
        return {"none": "None", "lax": "Lax", "strict": "Strict"}[v]
    # safe default
    return "Lax"


def configure_cors(app: Flask) -> None:
    from flask_cors import CORS

    FE_ORIGIN = os.environ.get("FE_ORIGIN", "http://localhost:3000")
    FE_ORIGIN_EXTRA = os.environ.get("FE_ORIGINS_EXTRA", "")
    COOKIE_SAMESITE_RAW = os.environ.get("COOKIE_SAMESITE", "Lax")
    COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")

    cookie_samesite = _normalize_samesite(COOKIE_SAMESITE_RAW)
    cookie_secure = COOKIE_SECURE.lower() in (
        "1",
        "true",
        "yes",
    )

    raw_extras = (
        [o.strip() for o in FE_ORIGIN_EXTRA.split(",")] if FE_ORIGIN_EXTRA else []
    )
    origins = list({o.strip() for o in ([FE_ORIGIN] + raw_extras) if o.strip()})

    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = cookie_samesite
    app.config["SESSION_COOKIE_SECURE"] = cookie_secure

    CORS(
        app,
        resources={r"/*": {"origins": origins}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        vary_header=True,
    )

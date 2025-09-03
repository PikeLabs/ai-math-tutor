import os
from flask import Flask, request
from dotenv import load_dotenv

from config.prisma import connect_db, disconnect_db

from config.paths import BACKEND_DOTENV
from routes.health import bp as health_bp
from routes.sessions import bp as sessions_bp
from routes.conversations import bp as conversations_bp
from routes.auth import auth_bp
from routes.feedback import bp as feedback_api_bp
from routes.chat import bp as chat_bp
from routes.assignments import bp as assignments_bp
from routes.media import bp as media_bp
from routes.uploads import bp as uploads_bp


# Load only backend/.env (local dev); do nothing if missing (prod)
load_dotenv(BACKEND_DOTENV, override=False)

API_PREFIX = "/api/v1"


def create_app():
    app = Flask(__name__)

    storage_root = os.environ.get("STORAGE_ROOT")
    if storage_root:
        os.environ.setdefault("TMPDIR", storage_root)

    from flask_cors import CORS

    # session config
    cookie_samesite = os.environ.get("COOKIE_SAMESITE", "Lax")
    cookie_secure = os.environ.get("COOKIE_SECURE", "false").lower() in (
        "1",
        "true",
        "yes",
    )
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = cookie_samesite
    app.config["SESSION_COOKIE_SECURE"] = cookie_secure

    FE_ORIGIN = os.environ.get("FE_ORIGIN", "http://localhost:3000")
    FE_ORIGIN_EXTRA = os.environ.get("FE_ORIGINS_EXTRA", "")

    raw_extras = (
        [o.strip() for o in FE_ORIGIN_EXTRA.split(",")] if FE_ORIGIN_EXTRA else []
    )
    origins = [FE_ORIGIN.strip(), *[o for o in raw_extras if o]]
    CORS(
        app,
        resources={r"/*": {"origins": origins}},  # <= widen so OPTIONS always matches
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        vary_header=True,
    )

    @app.before_request
    def _connect():
        # Let CORS preflights and health checks run without DB
        if request.method == "OPTIONS":
            return
        if request.path.startswith(f"{API_PREFIX}/health"):
            return

        connect_db()

    @app.teardown_appcontext
    def _disconnect(exception=None):
        try:
            disconnect_db()
        except Exception:
            pass

    # Register blueprints (all are url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix=API_PREFIX)
    app.register_blueprint(health_bp, url_prefix=API_PREFIX)
    app.register_blueprint(sessions_bp, url_prefix=API_PREFIX)
    app.register_blueprint(conversations_bp, url_prefix=API_PREFIX)
    # app.register_blueprint(professor_bp, url_prefix=API_PREFIX)
    app.register_blueprint(feedback_api_bp, url_prefix=API_PREFIX)
    app.register_blueprint(chat_bp, url_prefix=API_PREFIX)
    app.register_blueprint(assignments_bp, url_prefix=API_PREFIX)
    app.register_blueprint(media_bp, url_prefix=API_PREFIX)
    app.register_blueprint(uploads_bp, url_prefix=API_PREFIX)

    return app


if __name__ == "__main__":
    app = create_app()
    # Optional: run cleanup on startup (was in your __main__)

    try:
        from services.pdf_image_service import cleanup_old_sessions
        from services.feedback_service import cleanup_old_audio_sessions

        cleanup_old_sessions()
        cleanup_old_audio_sessions()
    except Exception:
        pass

    app.run(debug=True, host="0.0.0.0", port=5001)

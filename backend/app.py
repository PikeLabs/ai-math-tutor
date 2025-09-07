from flask import Flask, request
from dotenv import load_dotenv

from config.prisma import connect_db
from config.cors import configure_cors
from config.paths import BACKEND_DOTENV

from routes.assignments import bp as assignments_bp
from routes.auth import auth_bp
from routes.chat import bp as chat_bp
from routes.conversations import bp as conversations_bp
from routes.feedback import bp as feedback_api_bp
from routes.health import bp as health_bp
from routes.sessions import bp as sessions_bp
from routes.uploads import bp as uploads_bp


# Load only backend/.env (local dev); do nothing if missing (prod)
load_dotenv(BACKEND_DOTENV, override=False)

API_PREFIX = "/api/v1"


def create_app():
    from services.cleanup import start_cleanup_daemon

    app = Flask(__name__)

    configure_cors(app)

    @app.before_request
    def _ensure_prisma():
        # Let CORS preflights and health checks run without db
        if request.method == "OPTIONS":
            return
        if request.path.startswith(f"{API_PREFIX}/health"):
            return

        connect_db()

    start_cleanup_daemon()

    # Register blueprints (all are url_prefix="/api/v1")
    app.register_blueprint(assignments_bp, url_prefix=API_PREFIX)
    app.register_blueprint(auth_bp, url_prefix=API_PREFIX)
    app.register_blueprint(chat_bp, url_prefix=API_PREFIX)
    app.register_blueprint(conversations_bp, url_prefix=API_PREFIX)
    app.register_blueprint(feedback_api_bp, url_prefix=API_PREFIX)
    app.register_blueprint(health_bp, url_prefix=API_PREFIX)
    app.register_blueprint(sessions_bp, url_prefix=API_PREFIX)
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

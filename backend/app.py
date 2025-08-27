import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from services.db import connect_db, disconnect_db
from routes.health import bp as health_bp
from routes.sessions import bp as sessions_bp
from routes.conversations import bp as conversations_bp

# from routes.professor import bp as professor_bp
from routes.auth import auth_bp
from routes.feedback import bp as feedback_api_bp
from routes.chat import bp as chat_bp
from routes.assignments import bp as assignments_bp
from routes.media import bp as media_bp
from routes.uploads import bp as uploads_bp


load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_PREFIX = "/api/v1"


def create_app():
    app = Flask(__name__)

    # session config
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret")
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = (
        "Lax"  # "None" if cross-site prod with HTTPS
    )
    app.config["SESSION_COOKIE_SECURE"] = bool(os.environ.get("COOKIE_SECURE", ""))
    FE_ORIGIN = os.environ.get("FE_ORIGIN", "http://localhost:3000")
    CORS(
        app, resources={r"/api/*": {"origins": [FE_ORIGIN]}}, supports_credentials=True
    )

    @app.before_request
    def _connect():
        connect_db()

    # @app.teardown_appcontext
    # def shutdown_session(exception=None):
    #     disconnect_db()
    @app.teardown_appcontext
    def _disconnect(exception=None):
        disconnect_db()

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

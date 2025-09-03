# --- TEMP DIAGNOSTICS (remove after) ---
import os, sys, traceback

print("VERCEL DIAG >> cwd:", os.getcwd())
print("VERCEL DIAG >> first 3 sys.path entries:", sys.path[:3])
try:
    from wsgi import app

    print("VERCEL DIAG >> imported wsgi: OK")
except Exception as e:
    print("VERCEL DIAG >> import wsgi FAILED:", repr(e))
    traceback.print_exc()
    # minimal fallback so the function can still respond
    from flask import Flask

    app = Flask(__name__)

    @app.get("/_import_error")
    def _import_error():
        return {"error": str(e)}, 500


# --- END TEMP DIAGNOSTICS ---

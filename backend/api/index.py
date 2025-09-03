# api/index.py
import os, sys, subprocess, traceback

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)


def ensure_prisma_generated():
    """
    On serverless cold start, if the generated Prisma client is missing,
    run `python -m prisma generate` once, then continue.
    """
    try:
        # importing triggers the "client hasn't been generated" RuntimeError when missing
        from prisma import Prisma  # noqa: F401

        return
    except RuntimeError as e:
        if "hasn't been generated yet" not in str(e):
            # different issue; bubble up so you see the real traceback in logs
            raise
        print("⚙️  Prisma client not generated; generating now...")
        env = os.environ.copy()
        # Make sure the Prisma generator can find Node in the serverless sandbox
        env.setdefault("PRISMA_USE_NODEJS_BIN", "1")
        env["PATH"] = f"/python312/bin:{env.get('PATH','')}"
        schema_path = os.path.join(BASE_DIR, "prisma", "schema.prisma")
        cmd = [sys.executable, "-m", "prisma", "generate", "--schema", schema_path]

        proc = subprocess.run(
            cmd, cwd=BASE_DIR, env=env, capture_output=True, text=True
        )
        print("prisma generate stdout:\n", proc.stdout)
        print("prisma generate stderr:\n", proc.stderr)
        proc.check_returncode()
        print("✅ Prisma client generated.")


# Run the guard before importing your app
ensure_prisma_generated()

from wsgi import app

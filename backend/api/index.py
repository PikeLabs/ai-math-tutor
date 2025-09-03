# /backend/api/index.py
import os, sys

BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # /backend
GEN_ROOT = os.path.join(BASE_DIR, "prisma", "generated")  # /backend/prisma/generated

# Prisma (CLI + client) sometimes caches to ~/.cache; point caches at /tmp in serverless
os.environ.setdefault("XDG_CACHE_HOME", "/tmp")
os.environ.setdefault("PRISMA_PY_CACHEDIR", "/tmp/prisma-cache")

# Ensure the generated 'prisma' package shadows the stub from site-packages
for p in (GEN_ROOT, BASE_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from wsgi import app  # Flask WSGI callable

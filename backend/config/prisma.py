# backend/config/prisma.py
import threading
import atexit
from prisma import Prisma

_db = None  # lazily created per worker
_DB_LOCK = threading.Lock()
_CONNECT_LOCK = threading.Lock()


def get_db():
    global _db
    if _db is None:
        with _DB_LOCK:
            if _db is None:
                _db = Prisma()  # created inside the *worker* on first use
    return _db


def connect_db() -> None:
    db = get_db()
    if db.is_connected():
        return
    with _CONNECT_LOCK:
        if not db.is_connected():
            db.connect()
            print("✅ Prisma connected")


def disconnect_db() -> None:
    global _db
    # Don't create a client just to disconnect
    if _db is not None and _db.is_connected():
        _db.disconnect()
        print("🧹 Prisma disconnected")


atexit.register(disconnect_db)



class _DBProxy:
    def __getattr__(self, name):
        return getattr(get_db(), name)


db = _DBProxy()  # optional back-compat shim

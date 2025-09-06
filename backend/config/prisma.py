import threading
import atexit
from prisma import Prisma


db = Prisma()

_CONNECT_LOCK = threading.Lock()
_CONNECTING = False
_CONNECTED = False


def connect_db():
    global _CONNECTED, _CONNECTING
    if db.is_connected():
        _CONNECTED = True
        return

    with _CONNECT_LOCK:
        if db.is_connected():
            _CONNECTED = True
            return

        if not _CONNECTING:
            _CONNECTING = True
            try:
                db.connect()
                print("✅ Prisma connected")
                _CONNECTED = True
            finally:
                _CONNECTING = False


def disconnect_db():
    global _CONNECTED
    if db.is_connected():
        db.disconnect()
        print("🧹 Prisma disconnected")
        _CONNECTED = False


# Ensure clean shutdown for each worker
atexit.register(disconnect_db)

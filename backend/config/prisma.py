from prisma import Prisma

db = Prisma()


def connect_db():
    if not db.is_connected():
        db.connect()


def disconnect_db():
    if db.is_connected():
        db.disconnect()

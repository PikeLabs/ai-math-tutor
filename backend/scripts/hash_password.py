#### Use this script to create a hash for a new professor password
#### Run with `python backend/scripts/hash_password.py`

import bcrypt

def hash_password(plain_password: str) -> str:
    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


if __name__ == "__main__":
    plain = input("Enter password to hash: ").strip()
    hashed = hash_password(plain)
    print("\nHashed password:")
    print(hashed)
    print("\nYou can copy this into backend/.env as PROFESSOR_PASSWORD_HASH")

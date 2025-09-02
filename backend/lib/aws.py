import os
import re
from functools import lru_cache
from urllib.parse import urlparse

import boto3
from botocore.exceptions import ClientError

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_PREFIX = os.getenv("S3_PREFIX", "").strip("/")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

# S3 Folder Names
S3_SLIDE_IMAGES_FOLDER = os.getenv("S3_SLIDE_IMAGES_FOLDER")
S3_AUDIO_SESSIONS_FOLDER = os.getenv("S3_AUDIO_SESSIONS_FOLDER")


# ---- Client --------------------------------------------------------------

@lru_cache(maxsize=1)
def s3_client():
    """Lazily create and cache a single S3 client."""
    session = boto3.session.Session(region_name=AWS_REGION)
    return session.client("s3")


# ---- Key / URL helpers ---------------------------------------------------

_SAFE_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def _sanitize_filename(name: str) -> str:
    """Make sure we don't accidentally include paths or odd chars."""
    base = os.path.basename(name or "")
    return _SAFE_CHARS.sub("_", base)


def _sanitize_id(s: str) -> str:
    return _SAFE_CHARS.sub("_", s or "")


def build_key(session_id: str, filename: str, subdir: str | None = None) -> str:
    """
    Key format:  Key format: <S3_PREFIX?>/<subdir?>/<session_id>/<filename>
    - subdir is optional (e.g., "slide_images" or "audio_sessions")
    """
    sid = _sanitize_id(session_id)
    fname = _sanitize_filename(filename)
    sub = _sanitize_id(subdir) if subdir else None
    parts = [p for p in (S3_PREFIX, sub, sid, fname) if p]
    return "/".join(parts)


def public_url(key: str) -> str:
    """
    Construct a virtual-hosted–style URL.
    Note: For private buckets, prefer presigned_get_url().
    """
    bucket = S3_BUCKET_NAME
    region = AWS_REGION
    if not bucket or not key:
        return ""
    # us-east-1 special-case host
    if region == "us-east-1":
        host = f"{bucket}.s3.amazonaws.com"
    else:
        host = f"{bucket}.s3.{region}.amazonaws.com"
    return f"https://{host}/{key}"


def parse_s3_key_from_url(url: str) -> str | None:
    try:
        parsed = urlparse(url or "")
        return parsed.path.lstrip("/") or None
    except Exception:
        return None


# ---- Object ops ----------------------------------------------------------


def upload_file(
    local_path: str, key: str, *, content_type="application/pdf", encrypt=True
) -> None:
    """
    Upload a local file to S3 at the given key.
    Raises ClientError on failure.
    """
    if not S3_BUCKET_NAME:
        raise ValueError("S3_BUCKET_NAME is not set")
    extra = {"ContentType": content_type}
    if encrypt:
        extra["ServerSideEncryption"] = "AES256"
    s3_client().upload_file(local_path, S3_BUCKET_NAME, key, ExtraArgs=extra)


def delete_file(key: str) -> None:
    """Delete an object if bucket/key provided. No-op if missing."""
    if not S3_BUCKET_NAME or not key:
        return
    try:
        s3_client().delete_object(Bucket=S3_BUCKET_NAME, Key=key)
    except ClientError:
        # You may want to log this; swallow to avoid hard failing cleanups.
        pass


def presigned_get_url(key: str, expires: int = 3600) -> str:
    """Return a temporary URL to read a private object."""
    if not S3_BUCKET_NAME or not key:
        return ""
    return s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET_NAME, "Key": key},
        ExpiresIn=expires,
    )

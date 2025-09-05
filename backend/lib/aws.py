import os, re, warnings
from typing import Literal
from functools import lru_cache
from urllib.parse import urlparse
from xmlrpc.client import boolean
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
S3_PREFIX = os.getenv("S3_PREFIX", "").strip("/")
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
S3_SIGNED_URL_EXPIRES = int(os.getenv("S3_SIGNED_URL_EXPIRES", "3600"))

# S3 Folder Names
S3_SLIDE_IMAGES_FOLDER = os.getenv("S3_SLIDE_IMAGES_FOLDER")
S3_AUDIO_SESSIONS_FOLDER = os.getenv("S3_AUDIO_SESSIONS_FOLDER")

AWS_ENABLED = bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and S3_BUCKET_NAME)

if not AWS_ENABLED:
    print(
        "⚠️  S3 disabled: missing AWS credentials and/or bucket; continuing without S3"
    )


# ---- Client --------------------------------------------------------------


@lru_cache(maxsize=1)
def s3_client():
    """Lazily create and cache a single S3 client."""

    if not AWS_ENABLED:
        raise RuntimeError("S3 is not enabled/configured (missing configuration)")

    session = boto3.session.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )

    s3_client = session.client(
        "s3",
        config=Config(signature_version="s3v4"),
    )

    return s3_client


# ---- Key / Helpers ---------------------------------------------------

_SAFE_CHARS = re.compile(r"[^A-Za-z0-9._-]")


# TODO: write function that checks if AWS is enabled, and parameter 'key' is not falsey
def _ensure_aws_enabled(key: str | None) -> bool:
    if not AWS_ENABLED:
        warnings.warn("S3 is not enabled/configured (missing configuration)")

    return boolean(AWS_ENABLED and key)


def build_s3_filename(slide_num: int, type: Literal["thumb", "full", "audio"]) -> str:
    if type == "thumb":
        return f"slide_{slide_num}_thumb.png"
    elif type == "full":
        return f"slide_{slide_num}_full.png"
    elif type == "audio":
        return f"slide_{slide_num}.wav"

    raise ValueError(f"Unknown slide filename type: {type}")


def _sanitize_filename(name: str) -> str:
    """Make sure we don't accidentally include paths or odd chars."""
    base = os.path.basename(name or "")
    return _SAFE_CHARS.sub("_", base)


def _sanitize_id(s: str | None) -> str:
    return _SAFE_CHARS.sub("_", s or "")


def build_key(
    session_id: str,
    filename: str,
    subdir: str | None = None,
) -> str:
    """
    Key format: <S3_PREFIX?>/<subdir?>/<session_id>/<filename>
    - subdir is optional (e.g., "slide_images" or "audio_sessions")
    """
    sid = _sanitize_id(session_id)
    fname = _sanitize_filename(filename)
    sub = _sanitize_id(subdir) if subdir else None
    parts = [p for p in (S3_PREFIX, sub, sid, fname) if p]
    return "/".join(parts)


def parse_s3_key_from_url(url: str) -> str | None:
    """
    Extract an S3 object key from an S3-style URL.
    Supports:
      - s3://bucket/key
      - https://bucket.s3.amazonaws.com/key (and regional variants)
    Returns None for non-S3 URLs or local file paths.
    """
    try:
        parsed = urlparse(url or "")
        if parsed.scheme == "s3" and parsed.path:
            return parsed.path.lstrip("/") or None
        if (
            parsed.scheme in ("http", "https")
            and parsed.netloc
            and ".s3" in parsed.netloc
        ):
            return parsed.path.lstrip("/") or None
        return None
    except Exception:
        return None


def presigned_get_url(
    key: str,
    *,
    response_content_type: str | None = None,
    download_filename: str | None = None,
    expires: int | None = None,
) -> str:
    """
    Return a SigV4 presigned GET URL for the object key.
    - expires: seconds until expiration (defaults to S3_SIGNED_URL_EXPIRES)
    - response_content_type: optional override for content-type on download
    - download_filename: if set, sets Content-Disposition=inline; filename="..."
    """
    if not _ensure_aws_enabled(key):
        return ""

    params = {"Bucket": S3_BUCKET_NAME, "Key": key}
    expires = int(expires or S3_SIGNED_URL_EXPIRES)

    if response_content_type:
        params["ResponseContentType"] = response_content_type
    if download_filename:
        params["ResponseContentDisposition"] = f'inline; filename="{download_filename}"'

    try:
        return s3_client().generate_presigned_url(
            ClientMethod="get_object",
            Params=params,
            ExpiresIn=expires,
        )
    except ClientError as e:
        print(f"Error generating presigned GET URL: {e}")
        return ""


# Note: Keeping this for potential future use (client-direct uploads: browser -> s3)
def presigned_put_url(
    key: str,
    *,
    expires: int | None = None,
    content_type: str | None = None,
    encrypt: bool = True,
) -> dict:
    """
    (Optional) Create a presigned URL for PUT (client-direct upload).
    Not required for the current MVP if the server uploads on behalf of the client.
    """
    if not _ensure_aws_enabled(key):
        return {}

    fields = {}
    conditions = []

    if content_type:
        fields["Content-Type"] = content_type
        conditions.append({"Content-Type": content_type})
    if encrypt:
        fields["x-amz-server-side-encryption"] = "AES256"
        conditions.append({"x-amz-server-side-encryption": "AES256"})

    try:
        resp = s3_client().generate_presigned_post(
            Bucket=S3_BUCKET_NAME,
            Key=key,
            Fields=fields,
            Conditions=conditions,
            ExpiresIn=int(expires or S3_SIGNED_URL_EXPIRES),
        )

        return resp
    except ClientError as e:
        print(f"Error generating presigned PUT URL: {e}")
        return {}


# ---- Object ops ----------------------------------------------------------


def upload_file(
    local_path: str,
    key: str,
    *,
    content_type="application/pdf",
    encrypt=True,
) -> None:
    """
    Upload a local file to S3 at the given key.
    Raises ClientError on failure.
    """
    if not _ensure_aws_enabled(key):
        raise ValueError("Missing key argument in upload_file")

    extra = {"ContentType": content_type}
    if encrypt:
        extra["ServerSideEncryption"] = "AES256"

    s3_client().upload_file(local_path, S3_BUCKET_NAME, key, ExtraArgs=extra)


def delete_file(key: str) -> None:
    """Delete an object if bucket/key provided. No-op if missing."""
    if not _ensure_aws_enabled(key):
        return

    try:
        s3_client().delete_object(Bucket=S3_BUCKET_NAME, Key=key)
    except ClientError as e:
        # You may want to log this; swallow to avoid hard failing cleanups.
        print(f"Error deleting S3 object: {e}")
        pass

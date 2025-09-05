from typing import Optional, Dict

from services.database_service import get_slide_asset
from lib.aws import presigned_get_url


def get_presigned_slide_urls(
    session_id: str,
    slide_number: int,
):
    out: Dict[str, Optional[str]] = {
        "thumb": None,
        "full": None,
        "audio": None,
        "audio_mime": None,
    }

    thumb = get_slide_asset(session_id, slide_number, "image_thumb")

    if thumb and thumb.s3Key:
        out["thumb"] = presigned_get_url(thumb.s3Key, response_content_type="image/png")

    full = get_slide_asset(session_id, slide_number, "image_full")
    if full and full.s3Key:
        out["full"] = presigned_get_url(full.s3Key, response_content_type="image/png")

    audio = get_slide_asset(session_id, slide_number, "audio")
    if audio and audio.s3Key:
        mime = audio.mimeType or "audio/wav"
        out["audio"] = presigned_get_url(audio.s3Key, response_content_type=mime)
        out["audio_mime"] = mime

    return out

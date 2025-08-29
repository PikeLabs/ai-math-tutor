from typing import Union
from datetime import datetime, timezone


def parse_int(val, name):
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer")


def parse_iso_to_utc(value: Union[str, datetime]) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

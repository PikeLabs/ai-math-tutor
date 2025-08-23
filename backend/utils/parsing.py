def parse_int(val, name):
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer")

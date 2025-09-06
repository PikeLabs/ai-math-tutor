import random
import time


def with_retry(fn, *, attempts=4, base_delay=0.75, max_delay=6.0, on_error=None):
    """
    Run `fn()` with exponential backoff + jitter on transient errors.
    - attempts: total tries (1 initial + retries-1)
    - base_delay: initial backoff seconds
    - max_delay: cap for backoff
    """
    last_err = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last_err = e
            # Allow caller to inspect/log the error
            if on_error:
                try:
                    on_error(e, i)
                except Exception:
                    pass
            # If this was the last attempt, break
            if i == attempts - 1:
                break
            # Exponential backoff with jitter
            delay = min(max_delay, base_delay * (2**i))
            delay = delay * (0.7 + random.random() * 0.6)  # jitter ~ ±30%
            time.sleep(delay)

    # Bubble up final error
    if last_err:
        raise last_err

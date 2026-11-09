import asyncio
import time
import logging
from typing import Optional
from .publisher import get_redis_client

logger = logging.getLogger("agent-service.rate-limiter")

# Local in-memory fallback state
_local_windows: dict[str, list[float]] = {}
_lock = asyncio.Lock()

async def acquire_permit(
    key: str,
    max_requests: int = 10,
    window_seconds: int = 5,
    max_wait_seconds: float = 10.0
) -> bool:
    """
    Acquires an execution permit using a Redis-backed fixed-window rate limiter
    with exponential backoff and in-memory fallback.
    """
    start_time = time.time()
    backoff = 0.2

    while time.time() - start_time < max_wait_seconds:
        client = await get_redis_client()
        if client:
            try:
                current_bucket = int(time.time() // window_seconds)
                redis_key = f"ratelimit:{key}:{current_bucket}"
                # Atomic increment
                current_count = await client.incr(redis_key)
                if current_count == 1:
                    await client.expire(redis_key, window_seconds * 2)

                if current_count <= max_requests:
                    return True
                else:
                    logger.info(f"Rate limit exceeded for '{key}' ({current_count}/{max_requests}). Backing off {backoff:.2f}s...")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 1.5, 2.0)
                    continue
            except Exception as e:
                logger.debug(f"Redis rate limit check error ({e}), falling back to memory limiter")

        # In-memory fallback
        async with _lock:
            now = time.time()
            timestamps = _local_windows.get(key, [])
            # Purge timestamps outside the current window
            valid_timestamps = [t for t in timestamps if now - t < window_seconds]
            if len(valid_timestamps) < max_requests:
                valid_timestamps.append(now)
                _local_windows[key] = valid_timestamps
                return True

        logger.info(f"Local rate limit reached for '{key}'. Waiting {backoff:.2f}s...")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 1.5, 2.0)

    logger.warning(f"Rate limiter timed out waiting for permit on '{key}' after {max_wait_seconds}s")
    return False

async def acquire_llm_permit() -> bool:
    """Rate limiter for LLM calls (e.g. OpenAI / Anthropic)"""
    return await acquire_permit("llm_api", max_requests=10, window_seconds=5)

async def acquire_tool_permit() -> bool:
    """Rate limiter for external search and tool calls"""
    return await acquire_permit("tool_search", max_requests=15, window_seconds=5)

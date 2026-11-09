import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import redis.asyncio as redis
from ..config import settings

logger = logging.getLogger("agent-service.publisher")

import time
_redis_client: Optional[redis.Redis] = None
_last_failed_connect: float = 0.0

async def get_redis_client() -> Optional[redis.Redis]:
    global _redis_client, _last_failed_connect
    if _redis_client is not None:
        return _redis_client
    
    # If connection failed recently, skip trying to avoid blocking every event
    now = time.time()
    if now - _last_failed_connect < 5.0:
        return None

    try:
        client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            protocol=2,
            socket_timeout=1.0,
            socket_connect_timeout=1.0
        )
        await client.ping()
        _redis_client = client
        return _redis_client
    except Exception as e:
        _last_failed_connect = now
        logger.warning(f"Could not connect to Redis at {settings.REDIS_URL}: {e}")
        _redis_client = None
        return None

async def publish_progress(
    session_id: str,
    agent_name: str,
    step: str,
    status: str,
    summary: str,
    extra: Optional[Dict[str, Any]] = None
) -> None:
    """
    Publishes a structured real-time progress event to Redis pub/sub channel:
    session:<sessionId>:progress
    """
    if not session_id:
        return

    channel = f"session:{session_id}:progress"
    payload = {
        "sessionId": session_id,
        "agentName": agent_name,
        "step": step,
        "status": status,
        "summary": summary,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    if extra:
        payload.update(extra)

    try:
        client = await get_redis_client()
        if client:
            message = json.dumps(payload)
            await client.publish(channel, message)
            logger.info(f"[PubSub -> {channel}] [{agent_name}] {step} ({status}): {summary}")
    except Exception as e:
        logger.warning(f"Failed to publish progress to Redis channel {channel}: {e}")

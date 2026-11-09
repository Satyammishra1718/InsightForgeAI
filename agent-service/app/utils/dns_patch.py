import socket
import logging

logger = logging.getLogger("agent-service.dns")

_orig_socket_getaddrinfo = socket.getaddrinfo

# Public Cloudflare / Groq edge IPs if local network DNS times out
GROQ_FALLBACK_IPS = ["104.18.38.236", "172.64.149.20"]

def _patched_socket_getaddrinfo(host, port, *args, **kwargs):
    try:
        return _orig_socket_getaddrinfo(host, port, *args, **kwargs)
    except socket.gaierror as e:
        decoded = host.decode() if isinstance(host, bytes) else str(host)
        if "groq.com" in decoded:
            logger.info(f"[DNS Resiliency:Sync] Local DNS failed for '{decoded}'. Routing via Groq Edge IP: {GROQ_FALLBACK_IPS[0]}")
            target = GROQ_FALLBACK_IPS[0].encode() if isinstance(host, bytes) else GROQ_FALLBACK_IPS[0]
            return _orig_socket_getaddrinfo(target, port, *args, **kwargs)
        raise e

def apply_dns_resiliency():
    """
    Applies transparent socket-level and anyio-level DNS fallback for firewalled networks or college WiFi
    where port 53 or DNS timeouts occur on AI endpoints.
    """
    socket.getaddrinfo = _patched_socket_getaddrinfo

    try:
        import anyio._backends._asyncio
        orig_anyio_getaddrinfo = anyio._backends._asyncio.AsyncIOBackend.getaddrinfo

        async def _patched_anyio_getaddrinfo(host, port, *args, **kwargs):
            try:
                return await orig_anyio_getaddrinfo(host, port, *args, **kwargs)
            except socket.gaierror as e:
                decoded = host.decode() if isinstance(host, bytes) else str(host)
                if "groq.com" in decoded:
                    logger.info(f"[DNS Resiliency:Async] Local DNS failed for '{decoded}'. Routing via Groq Edge IP: {GROQ_FALLBACK_IPS[0]}")
                    target = GROQ_FALLBACK_IPS[0].encode() if isinstance(host, bytes) else GROQ_FALLBACK_IPS[0]
                    return await orig_anyio_getaddrinfo(target, port, *args, **kwargs)
                raise e

        anyio._backends._asyncio.AsyncIOBackend.getaddrinfo = _patched_anyio_getaddrinfo
        logger.info("[DNS Resiliency] Applied sync and async DNS resiliency patches.")
    except Exception as e:
        logger.warning(f"[DNS Resiliency] Could not attach anyio DNS patch: {e}")

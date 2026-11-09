"""
Model Context Protocol client for the researcher agents.

Researchers reach their tools (web search, hybrid document retrieval) through the
standalone MCP servers in mcp-servers/. Each call opens an SSE session, performs
the MCP handshake, invokes the tool, and parses the JSON text payload.

If an MCP server is not configured or unreachable, call_mcp_tool returns None so
the caller can fall back to the direct HTTP implementation in tools/client.py.
"""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from mcp import ClientSession
from mcp.client.sse import sse_client

logger = logging.getLogger("agent-service.mcp")

# Total budget for connect + handshake + tool call, per invocation.
MCP_CALL_TIMEOUT_SECONDS = 10.0


async def _call(url: str, tool: str, arguments: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    async with sse_client(url, timeout=3.0) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool, arguments)

    if getattr(result, "isError", False):
        logger.warning(f"[MCP] Tool '{tool}' at {url} returned an error result")
        return None

    for item in getattr(result, "content", None) or []:
        text = getattr(item, "text", None)
        if not text:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"[MCP] Tool '{tool}' returned non-JSON text: {text[:120]}")
            return None
        return parsed if isinstance(parsed, list) else None
    return []


async def call_mcp_tool(url: str, tool: str, arguments: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """Invoke an MCP tool. Returns the decoded list result, or None if MCP is unavailable."""
    if not url:
        return None
    try:
        result = await asyncio.wait_for(_call(url, tool, arguments), timeout=MCP_CALL_TIMEOUT_SECONDS)
        logger.info(f"[MCP] {tool} via {url} -> {len(result or [])} results")
        return result
    except Exception as e:  # connection refused, timeout, protocol error
        # ExceptionGroup from anyio task groups hides the useful message one level down.
        inner = getattr(e, "exceptions", None)
        detail = inner[0] if inner else e
        logger.warning(f"[MCP] {tool} via {url} unavailable ({type(detail).__name__}: {detail}); using direct fallback")
        return None

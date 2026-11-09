import logging
import httpx
from typing import List, Dict, Any, Optional
from ..config import settings

logger = logging.getLogger("agent-service.tools")

async def retrieve_context(session_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Retrieve document chunks from the backend RAG module via POST /api/rag/query.
    """
    url = f"{settings.BACKEND_URL.rstrip('/')}/api/rag/query"
    payload = {
        "sessionId": session_id,
        "query": query,
        "topK": top_k
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                logger.info(f"Retrieved {len(results)} chunks from backend RAG for query: '{query}'")
                return results
            else:
                logger.warning(f"RAG query returned status {resp.status_code}: {resp.text}")
                return []
    except Exception as e:
        logger.warning(f"Failed to query backend RAG at {url}: {e}")
        return []

async def web_search(query: str, max_results: int = 5) -> List[Dict[str, Any]]:
    """
    Perform web search via Tavily API if configured, otherwise fallback to DuckDuckGo HTML/Instant search.
    Returns list of dicts with: title, url, snippet.
    """
    # 1. Tavily if key present
    if settings.TAVILY_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": settings.TAVILY_API_KEY,
                        "query": query,
                        "max_results": max_results,
                        "search_depth": "basic",
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    results = []
                    for item in data.get("results", []):
                        results.append({
                            "title": item.get("title", ""),
                            "url": item.get("url", ""),
                            "snippet": item.get("content", "")
                        })
                    if results:
                        return results
        except Exception as e:
            logger.warning(f"Tavily search failed: {e}")

    # 2. DuckDuckGo Instant Answer / API fallback
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                "https://api.duckduckgo.com/",
                params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"}
            )
            if resp.status_code == 200:
                data = resp.json()
                results = []
                abstract = data.get("AbstractText")
                abstract_url = data.get("AbstractURL")
                heading = data.get("Heading")
                if abstract and abstract_url:
                    results.append({
                        "title": heading or query,
                        "url": abstract_url,
                        "snippet": abstract
                    })
                
                for topic in data.get("RelatedTopics", [])[:max_results]:
                    if isinstance(topic, dict) and "Text" in topic and "FirstURL" in topic:
                        results.append({
                            "title": topic.get("Text", "")[:60] + "...",
                            "url": topic.get("FirstURL", ""),
                            "snippet": topic.get("Text", "")
                        })
                if results:
                    return results[:max_results]
    except Exception as e:
        logger.warning(f"DuckDuckGo search fallback failed: {e}")

    # 3. No provider answered: return nothing rather than fabricating a citation.
    return []

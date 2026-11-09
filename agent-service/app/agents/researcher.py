import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage
from .llm import get_chat_model, invoke_llm, is_real_llm_configured
from ..models.state import GraphState
from ..tools.client import retrieve_context, web_search
from ..tools.mcp_client import call_mcp_tool
from ..config import settings
from ..utils.publisher import publish_progress
from ..utils.rate_limiter import acquire_llm_permit, acquire_tool_permit

logger = logging.getLogger("agent-service.researcher")

RESEARCHER_SYSTEM_PROMPT = """You are an Expert Research Specialist.
Your task is to analyze the provided context (from RAG and search results) and answer a specific sub-question thoroughly.
Ground your response strictly in the provided evidence. Cite sources using bracket notation [Source Title or Index].

Return ONLY a valid JSON object matching:
{
  "findings": "Detailed technical findings with inline source references...",
  "sources": [
    {"title": "Title of source", "url": "URL if available", "snippet": "Relevant excerpt"}
  ]
}
"""

async def _retrieve_via_mcp(session_id: str, query: str, top_k: int) -> List[Dict[str, Any]]:
    """Hybrid (dense + BM25) document retrieval through the mcp-doc-retrieval server."""
    results = await call_mcp_tool(
        settings.MCP_DOC_RETRIEVAL_URL, "retrieve_context",
        {"sessionId": session_id, "query": query, "topK": top_k},
    )
    if results is None:
        return await retrieve_context(session_id, query, top_k=top_k)
    return results


async def _search_via_mcp(query: str, max_results: int) -> List[Dict[str, Any]]:
    """Web search through the mcp-web-search server."""
    results = await call_mcp_tool(settings.MCP_WEB_SEARCH_URL, "web_search", {"query": query})
    if results is None:
        return await web_search(query, max_results=max_results)
    return results[:max_results]


async def conduct_single_research(session_id: str, sub_q: str, index: int) -> Dict[str, Any]:
    logger.info(f"[Researcher-{index}] Investigating: '{sub_q}'")

    # Rate limiting for tool calls
    await acquire_tool_permit()

    # Run RAG retrieval and web search concurrently via MCP tool servers
    # (each falls back to a direct call if its MCP server is unreachable)
    rag_task = _retrieve_via_mcp(session_id, sub_q, top_k=4)
    web_task = _search_via_mcp(sub_q, max_results=3)
    rag_results, web_results = await asyncio.gather(rag_task, web_task)

    # Consolidate sources
    collected_sources: List[Dict[str, str]] = []
    context_snippets: List[str] = []

    for chunk in rag_results:
        src = chunk.get("source", "Document Store")
        title = chunk.get("title") or src
        text = chunk.get("text", "")
        collected_sources.append({
            "title": title,
            "url": f"local://rag/{src}",
            "snippet": text[:1500]  # the Critic verifies against this; 200 chars hid most evidence
        })
        context_snippets.append(f"[RAG: {title}]\n{text}")

    for w in web_results:
        collected_sources.append({
            "title": w.get("title", "Web Source"),
            "url": w.get("url", ""),
            "snippet": w.get("snippet", "")
        })
        context_snippets.append(f"[WEB: {w.get('title')}]\n{w.get('snippet')}")

    context_str = "\n\n".join(context_snippets) if context_snippets else "No external documents found. Use domain knowledge."

    findings_text = ""
    llm = get_chat_model(temperature=0.3)
    if llm:
        await acquire_llm_permit()
        resp = await invoke_llm(
            llm=llm,
            messages=[
                SystemMessage(content=RESEARCHER_SYSTEM_PROMPT),
                HumanMessage(content=f"Sub-Question:\n{sub_q}\n\nEvidence Context:\n{context_str}")
            ],
            agent_name=f"Researcher-{index}"
        )
        content = resp.content
        if isinstance(content, str):
            cleaned = content.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            try:
                parsed = json.loads(cleaned.strip())
                if isinstance(parsed, dict) and "findings" in parsed:
                    findings_text = parsed["findings"]
                    # Keep only the sources the LLM cited that we actually retrieved, so a
                    # model-invented URL can never become a citation. Fall back to all retrieved.
                    retrieved_by_url = {s["url"]: s for s in collected_sources if s.get("url")}
                    cited = [
                        retrieved_by_url[s["url"]]
                        for s in parsed.get("sources") or []
                        if isinstance(s, dict) and s.get("url") in retrieved_by_url
                    ]
                    if cited:
                        cited_urls = {c["url"] for c in cited}
                        collected_sources = cited + [s for s in collected_sources if s.get("url") not in cited_urls]
                elif isinstance(parsed, dict) and "analysis" in parsed:
                    findings_text = parsed["analysis"]
                else:
                    findings_text = cleaned
            except json.JSONDecodeError:
                # LLM output direct analysis text
                findings_text = cleaned

        if not findings_text and is_real_llm_configured():
            raise RuntimeError(f"[Researcher-{index}] Real LLM call succeeded but returned empty findings for sub-question: '{sub_q}'")

    elif not is_real_llm_configured():
        # Fallback findings strictly for unconfigured local dev mode
        if "postgresql" in sub_q.lower() or "mongodb" in sub_q.lower():
            if "storage" in sub_q.lower() or "write path" in sub_q.lower():
                findings_text = (
                    "PostgreSQL utilizes a Write-Ahead Log (WAL) and MVCC where updates create new tuple versions in heap tables, "
                    "requiring regular VACUUM maintenance. In contrast, MongoDB's WiredTiger engine uses a journal, memory-mapped write cache, "
                    "and periodic checkpoints every 60 seconds, allowing high write concurrency via document-level locking."
                )
            elif "throughput" in sub_q.lower() or "index" in sub_q.lower():
                findings_text = (
                    "In insert-heavy workloads with minimal secondary indexing, MongoDB WiredTiger achieves high ingestion throughput "
                    "due to append-friendly B-tree allocations. However, PostgreSQL with unlogged tables or batched COPY operations "
                    "achieves comparable or higher sustained throughput while maintaining strict ACID compliance."
                )
            elif "sharding" in sub_q.lower() or "scalability" in sub_q.lower():
                findings_text = (
                    "MongoDB provides native range and hashed horizontal sharding with automated chunk balancing across mongos routers. "
                    "PostgreSQL offers declarative declarative table partitioning and streaming replication, but horizontal write-scaling "
                    "often requires extensions like Citus."
                )
            elif "claim" in sub_q.lower():
                findings_text = (
                    "Claim under review: 'MongoDB always achieves 10x higher write throughput than PostgreSQL in all production scenarios without durability risk.' "
                    "Benchmark analysis shows this claim is unsupported and misleading: default configurations with j:true and majority write concerns "
                    "introduce fsync latencies similar to PostgreSQL fsync commits."
                )
            else:
                findings_text = f"Empirical analysis for '{sub_q}' demonstrates distinct tradeoffs between document storage and relational ACID storage."
        else:
            findings_text = f"Research investigation into '{sub_q}' indicates key structural factors and trade-offs verified across evidence sources."

    finding_item = {
        "subQuestionId": f"sq_{index}",
        "subQuestion": sub_q,
        "findings": findings_text,
        "sources": collected_sources[:8]  # 4 RAG + 3 web fit; [:4] used to drop every web source
    }

    timestamp = datetime.now(timezone.utc).isoformat()
    trace_item = {
        "agentName": f"Researcher_{index}",
        "step": "research_subquestion",
        "input": {"subQuestion": sub_q, "sessionId": session_id},
        "output": {
            "subQuestionId": f"sq_{index}",
            "findingsLength": len(findings_text),
            "sourcesCount": len(collected_sources)
        },
        "timestamp": timestamp
    }

    return {
        "finding": finding_item,
        "trace": trace_item
    }

async def parallel_researcher_node(state: GraphState) -> Dict[str, Any]:
    """
    Executes multiple researcher tasks concurrently across sub-questions.
    """
    session_id = state.get("sessionId", "")
    sub_questions = state.get("subQuestions", [])
    logger.info(f"[Researchers] Launching parallel research across {len(sub_questions)} sub-questions")

    # Live progress event: Researchers dispatched
    await publish_progress(
        session_id=session_id,
        agent_name="Researcher",
        step="parallel_investigation",
        status="in_progress",
        summary=f"Running {len(sub_questions)} researcher agents in parallel against RAG and web tools.",
        extra={"activeAgents": len(sub_questions)}
    )

    tasks = [
        conduct_single_research(session_id, q, idx + 1)
        for idx, q in enumerate(sub_questions)
    ]
    
    results = await asyncio.gather(*tasks)

    findings = [r["finding"] for r in results]
    traces = [r["trace"] for r in results]

    # Live progress event: Researchers completed
    await publish_progress(
        session_id=session_id,
        agent_name="Researcher",
        step="parallel_investigation",
        status="completed",
        summary=f"Parallel research completed: compiled findings for {len(findings)} sub-questions.",
        extra={"findingsCount": len(findings)}
    )

    return {
        "researchFindings": findings,
        "traces": traces
    }

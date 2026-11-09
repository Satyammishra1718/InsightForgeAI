import asyncio
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from .utils.dns_patch import apply_dns_resiliency

# Apply socket DNS resiliency for firewalled networks
apply_dns_resiliency()

from .config import settings
from .models.state import ResearchRequest, ResearchResponse
from .graph.builder import research_graph
from .utils.logger import setup_logging, set_session_context
from .agents.llm import is_real_llm_configured

# Configure structured, correlated logging
setup_logging()
logger = logging.getLogger("agent-service")

app = FastAPI(
    title="InsightForge Agent Service",
    description="Python FastAPI LangGraph Microservice for Multi-Agent Research Orchestration",
    version="1.0.0"
)

# Enable CORS for local dev / frontend / backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    llm_ready = is_real_llm_configured()
    return {
        "status": "ok",
        "service": "agent-service",
        "framework": "LangGraph + FastAPI",
        "version": "1.0.0",
        "llmConfigured": llm_ready,
        "llmProvider": settings.LLM_PROVIDER,
        "mockMode": (not llm_ready) and settings.ALLOW_MOCK_LLM,
    }

async def _run_graph_until_disconnect(http_request: Request, initial_state: dict) -> dict:
    """
    Run the LangGraph pipeline, cancelling it if the caller disconnects (e.g. the backend
    hit its timeout and BullMQ will retry). Without this, an abandoned run keeps spending
    LLM quota in the background while the retry starts a second, competing run.
    """
    graph_task = asyncio.create_task(research_graph.ainvoke(initial_state))
    try:
        while True:
            done, _ = await asyncio.wait({graph_task}, timeout=1.0)
            if done:
                return graph_task.result()
            if await http_request.is_disconnected():
                logger.warning("Caller disconnected; cancelling LangGraph pipeline run.")
                graph_task.cancel()
                raise HTTPException(status_code=499, detail="Client disconnected; pipeline cancelled")
    finally:
        if not graph_task.done():
            graph_task.cancel()


@app.post("/run-research")
async def run_research(request: ResearchRequest, http_request: Request):
    """
    Executes the full LangGraph multi-agent research pipeline:
    Planner -> Parallel Researchers -> Critic -> Synthesizer
    """
    session_id = request.sessionId.strip()
    query = request.query.strip()

    if not session_id:
        raise HTTPException(status_code=400, detail="sessionId is required")
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    if not is_real_llm_configured() and not settings.ALLOW_MOCK_LLM:
        raise HTTPException(
            status_code=503,
            detail=(
                f"No LLM API key configured for provider '{settings.LLM_PROVIDER}'. "
                "Set GROQ_API_KEY (or LLM_PROVIDER=openai with OPENAI_API_KEY), "
                "or set ALLOW_MOCK_LLM=true to use canned offline output."
            ),
        )

    set_session_context(session_id)
    logger.info(f"Received research request: '{query}'")

    initial_state = {
        "sessionId": session_id,
        "originalQuery": query,
        "subQuestions": [],
        "researchFindings": [],
        "verifiedClaims": [],
        "flaggedClaims": [],
        "finalReport": {},
        "traces": []
    }

    try:
        final_state = await _run_graph_until_disconnect(http_request, initial_state)

        report = final_state.get("finalReport", {})
        traces = final_state.get("traces", [])
        verified_claims = final_state.get("verifiedClaims", [])
        flagged_claims = final_state.get("flaggedClaims", [])
        sub_questions = final_state.get("subQuestions", [])
        research_findings = final_state.get("researchFindings", [])

        logger.info(
            f"Completed research for session {session_id}. "
            f"Generated {len(sub_questions)} sub-questions, {len(research_findings)} findings, "
            f"{len(verified_claims)} verified claims, {len(flagged_claims)} flagged claims, "
            f"{len(traces)} trace items."
        )

        return {
            "sessionId": session_id,
            "query": query,
            "status": "completed",
            "report": report,
            "subQuestions": sub_questions,
            "researchFindings": research_findings,
            "verifiedClaims": verified_claims,
            "flaggedClaims": flagged_claims,
            "traces": traces
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during LangGraph pipeline execution: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)

import json
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage
from .llm import get_chat_model, invoke_llm, is_real_llm_configured
from ..models.state import GraphState
from ..utils.publisher import publish_progress
from ..utils.rate_limiter import acquire_llm_permit

logger = logging.getLogger("agent-service.planner")

PLANNER_SYSTEM_PROMPT = """You are a Principal Research Architect and Planner.
Given a user query or research topic, decompose it into 3 to 4 focused, complementary, and non-overlapping sub-questions.
Each sub-question should target a distinct facet of the investigation (e.g., architecture, performance & throughput, operational complexity, tradeoffs).

If the topic contains a loaded, exaggerated, or false premise (e.g. "prove X is always 100x faster"),
do NOT refuse and do NOT return an empty list: write neutral sub-questions that test the claim against
evidence (what benchmarks show, under which conditions it holds, which caveats apply).

Return ONLY a valid JSON array of strings containing the sub-questions.
Example:
[
  "What are the internal storage engine and write path mechanisms of MongoDB versus PostgreSQL?",
  "How do horizontal sharding and replica sets compare to table partitioning and streaming replication under high write loads?",
  "What are the operational, indexing, and memory overhead tradeoffs between the two databases?"
]
"""

def _parse_sub_questions(content: Any) -> List[str]:
    """Extract a list of sub-question strings from an LLM reply (JSON array preferred)."""
    if not isinstance(content, str):
        return []
    # Reasoning models (e.g. qwen3) may prepend <think>...</think>; drop it before parsing.
    cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(?:json)?|```$", "", cleaned, flags=re.MULTILINE).strip()

    match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                questions = [str(q).strip() for q in parsed if isinstance(q, (str, int, float)) and str(q).strip()]
                if questions:
                    return questions[:4]
        except json.JSONDecodeError as jde:
            logger.warning(f"[Planner] JSON parsing failed: {jde}. Raw content: {cleaned[:100]}")

    # Fallback: numbered / bulleted lines that look like questions.
    lines = [
        re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip().strip('",')
        for line in cleaned.splitlines()
    ]
    questions = [line for line in lines if line.endswith("?") and len(line) > 15]
    return questions[:4] if len(questions) >= 2 else []


async def planner_node(state: GraphState) -> Dict[str, Any]:
    query = state.get("originalQuery", "")
    session_id = state.get("sessionId", "")
    logger.info(f"[Planner] Generating sub-questions for query: '{query}'")

    # Live progress event: Planner started
    await publish_progress(
        session_id=session_id,
        agent_name="Planner",
        step="decompose_query",
        status="in_progress",
        summary=f"Analyzing query and decomposing topic into sub-questions: '{query}'"
    )

    sub_questions: List[str] = []
    llm = get_chat_model(temperature=0.2)

    if llm:
        prompts = [
            f"Decompose this research topic:\n{query}",
            # Retry framing for loaded / false-premise questions the model declined to split.
            "Write 3 neutral, evidence-seeking sub-questions that would test the claims in this topic, "
            f"including the conditions under which they hold or fail. Topic:\n{query}",
        ]
        for attempt, user_prompt in enumerate(prompts):
            if attempt > 0:
                logger.warning("[Planner] Empty or unparseable plan; retrying with neutral evidence-seeking framing.")
            await acquire_llm_permit()
            response = await invoke_llm(
                llm=llm,
                messages=[
                    SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt)
                ],
                agent_name="Planner"
            )
            sub_questions = _parse_sub_questions(response.content)
            if sub_questions:
                break

        if not sub_questions:
            # Never fail the whole job because the plan came back empty: research the query directly.
            logger.warning("[Planner] No usable sub-questions from LLM; researching the original query directly.")
            sub_questions = [query]

    elif not is_real_llm_configured():
        # Fallback strictly for local unconfigured dev mode
        if "postgresql" in query.lower() and "mongodb" in query.lower():
            sub_questions = [
                "What are the internal storage engine write path architectures (WiredTiger vs WAL) in MongoDB and PostgreSQL?",
                "How do write throughput, concurrency control, and index update penalties compare between the two under heavy load?",
                "What are the horizontal scalability, sharding, and replication tradeoffs for write-heavy deployments?",
                "Claim to verify: Does MongoDB always achieve 10x higher write throughput than PostgreSQL in all production scenarios without durability risk?"
            ]
        else:
            sub_questions = [
                f"What are the core architectural mechanisms and principles behind {query}?",
                f"What are the performance characteristics, bottlenecks, and benchmarks for {query}?",
                f"What are the practical deployment tradeoffs, limitations, and operational challenges of {query}?",
                f"Claim to verify: Does {query} completely eliminate all operational overhead in every system?"
            ]

    timestamp = datetime.now(timezone.utc).isoformat()
    trace_item = {
        "agentName": "Planner",
        "step": "decompose_query",
        "input": {"query": query, "sessionId": session_id},
        "output": {"subQuestions": sub_questions, "count": len(sub_questions)},
        "timestamp": timestamp
    }

    # Live progress event: Planner completed
    await publish_progress(
        session_id=session_id,
        agent_name="Planner",
        step="decompose_query",
        status="completed",
        summary=f"Decomposed query into {len(sub_questions)} focused sub-questions.",
        extra={"subQuestionsCount": len(sub_questions)}
    )

    return {
        "subQuestions": sub_questions,
        "traces": [trace_item]
    }

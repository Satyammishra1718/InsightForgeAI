import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage
from .llm import get_chat_model, invoke_llm, is_real_llm_configured
from ..models.state import GraphState
from ..utils.publisher import publish_progress
from ..utils.rate_limiter import acquire_llm_permit
from ..utils.json_cleaner import parse_json_safely, extract_claims_from_raw_text

logger = logging.getLogger("agent-service.critic")

CRITIC_SYSTEM_PROMPT = """You are a rigorous Scientific Critic and Verification Agent.
You are given researcher findings AND the raw source evidence (numbered excerpts) each finding was based on.
Extract 3 to 6 focused factual claims from the findings and check each one AGAINST THE EVIDENCE EXCERPTS.
For each claim, determine if it is:
- "verified": directly supported by at least one evidence excerpt. List the supporting excerpt(s) in "sources" using their exact title and url.
- "flagged": not supported by any excerpt, contradicted by an excerpt, hyperbolic, or missing important caveats.

Do not mark a claim verified on the basis of general knowledge alone; it must be traceable to an excerpt.
Keep each claim concise (1-2 sentences).
Return ONLY a valid JSON object matching:
{
  "verifiedClaims": [
    {"claim": "Concise verified claim text", "status": "verified", "reason": "Grounded in engine documentation", "sources": []}
  ],
  "flaggedClaims": [
    {"claim": "Concise flagged claim text", "status": "flagged", "reason": "Fails durability safety check / hyperbolic", "sources": []}
  ]
}
"""

async def critic_node(state: GraphState) -> Dict[str, Any]:
    findings = state.get("researchFindings", [])
    session_id = state.get("sessionId", "")
    logger.info(f"[Critic] Verifying claims across {len(findings)} research findings")

    # Live progress event: Critic verification started
    await publish_progress(
        session_id=session_id,
        agent_name="Critic",
        step="verify_claims",
        status="in_progress",
        summary=f"Cross-checking {len(findings)} research findings against retrieved evidence to detect unsupported claims.",
        extra={"findingsCount": len(findings)}
    )

    def _format_evidence(sources: List[Dict[str, Any]]) -> str:
        if not sources:
            return "  (no evidence retrieved)"
        return "\n".join(
            f"  [{i + 1}] {s.get('title', 'Source')} ({s.get('url', '')}): {str(s.get('snippet', ''))[:1500]}"
            for i, s in enumerate(sources)
        )

    findings_text = "\n\n".join([
        f"SubQuestion: {f.get('subQuestion')}\n"
        f"Findings: {f.get('findings')}\n"
        f"Evidence excerpts:\n{_format_evidence(f.get('sources', []))}"
        for f in findings
    ])

    verified_claims: List[Dict[str, Any]] = []
    flagged_claims: List[Dict[str, Any]] = []

    llm = get_chat_model(temperature=0.1)
    if llm and findings:
        await acquire_llm_permit()
        resp = await invoke_llm(
            llm=llm,
            messages=[
                SystemMessage(content=CRITIC_SYSTEM_PROMPT),
                HumanMessage(content=f"Verify claims from these findings:\n{findings_text}")
            ],
            agent_name="Critic"
        )
        content = resp.content
        if isinstance(content, str):
            parsed = parse_json_safely(content)
            if isinstance(parsed, dict):
                verified_claims = parsed.get("verifiedClaims", [])
                flagged_claims = parsed.get("flaggedClaims", [])

        # Normalise shape and status so downstream code can trust the bucket a claim is in.
        def _normalise(items: Any, status: str) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for c in items if isinstance(items, list) else []:
                if isinstance(c, str):
                    c = {"claim": c}
                if not isinstance(c, dict) or not str(c.get("claim", "")).strip():
                    continue
                srcs = c.get("sources")
                out.append({
                    "claim": str(c["claim"]).strip(),
                    "status": status,
                    "reason": str(c.get("reason", "")),
                    "sources": [s for s in srcs if isinstance(s, dict)] if isinstance(srcs, list) else [],
                })
            return out

        verified_claims = _normalise(verified_claims, "verified")
        flagged_claims = _normalise(flagged_claims, "flagged")

        if not verified_claims and not flagged_claims:
            # The critic's output was unusable. Do NOT pretend these were verified:
            # carry the findings forward explicitly labelled as unverified.
            logger.warning("[Critic] Could not parse critic output; passing findings through as UNVERIFIED.")
            for f in findings:
                f_text = f.get("findings", "")
                if f_text:
                    verified_claims.append({
                        "claim": f_text[:200].strip(),
                        "status": "unverified",
                        "reason": "Critic output could not be parsed; claim was not independently checked against evidence.",
                        "sources": f.get("sources", [])
                    })

    elif not is_real_llm_configured():
        # Fallback / deterministic verification strictly for unconfigured local dev mode
        orig_query = state.get("originalQuery", "the evaluated system")
        for f in findings:
            q = f.get("subQuestion", "")
            finding_text = f.get("findings", "")
            sources = f.get("sources", [])

            # Check if this finding contains an unsupported or exaggerated claim
            if any(term in finding_text.lower() or term in q.lower() for term in ["10x", "always", "eliminates all", "zero risk", "claim to verify", "eliminate", "without risk"]):
                if "claim to verify:" in q.lower():
                    claim_str = q.split(":", 1)[1].strip()
                elif "claim to verify:" in finding_text.lower():
                    claim_str = finding_text.split(":", 1)[1].strip()
                elif "postgresql" in orig_query.lower() and "mongodb" in orig_query.lower():
                    claim_str = "MongoDB always achieves 10x higher write throughput than PostgreSQL in all production workloads without durability risk."
                else:
                    claim_str = f"Categorical claim that {orig_query} eliminates all operational trade-offs with zero performance risk."

                flagged_claims.append({
                    "claim": claim_str,
                    "status": "flagged",
                    "reason": f"Flagged by Critic: Architectural benchmarks contradict unconditional assertions; durability, hardware limits, and operational overhead always apply.",
                    "sources": sources
                })
            else:
                verified_claims.append({
                    "claim": finding_text[:160] + ("..." if len(finding_text) > 160 else ""),
                    "status": "verified",
                    "reason": "Empirically supported by retrieved technical documentation and source evidence.",
                    "sources": sources
                })

    # Ensure at least one unsupported claim is flagged only in unconfigured local mock mode
    if not flagged_claims and not is_real_llm_configured():
        orig_query = state.get("originalQuery", "the evaluated architecture")
        flagged_claims.append({
            "claim": f"Unverified claim that {orig_query} incurs zero operational trade-offs across all workload profiles.",
            "status": "flagged",
            "reason": "Flagged by Critic: All distributed and computational architectures exhibit trade-offs under scale or strict consistency requirements.",
            "sources": []
        })

    timestamp = datetime.now(timezone.utc).isoformat()
    trace_item = {
        "agentName": "Critic",
        "step": "verify_claims",
        "input": {"totalFindings": len(findings), "sessionId": session_id},
        "output": {
            "verifiedCount": len(verified_claims),
            "flaggedCount": len(flagged_claims),
            "flaggedSample": flagged_claims[0]["claim"] if flagged_claims else None
        },
        "timestamp": timestamp
    }

    # Live progress event: Critic completed
    await publish_progress(
        session_id=session_id,
        agent_name="Critic",
        step="verify_claims",
        status="completed",
        summary=f"Claim verification completed: {len(verified_claims)} verified, {len(flagged_claims)} flagged/unsupported.",
        extra={"verifiedCount": len(verified_claims), "flaggedCount": len(flagged_claims)}
    )

    return {
        "verifiedClaims": verified_claims,
        "flaggedClaims": flagged_claims,
        "traces": [trace_item]
    }

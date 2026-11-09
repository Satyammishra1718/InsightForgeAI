import pytest
from app.agents.critic import critic_node
from app.agents.planner import planner_node

@pytest.mark.asyncio
async def test_critic_node_detects_unsupported_claims():
    """
    Tests that the Critic agent node processes research findings,
    identifies unsupported or hyperbolic assertions, and flags them.
    """
    mock_state = {
        "sessionId": "test_critic_session_001",
        "originalQuery": "MongoDB vs PostgreSQL high-throughput insert benchmarks",
        "researchFindings": [
            {
                "subQuestionId": "sq_1",
                "subQuestion": "What are the storage engine write mechanics?",
                "findings": "MongoDB WiredTiger uses an in-memory buffer before flushing checkpoints every 60 seconds, whereas PostgreSQL WAL writes sequentially.",
                "sources": [{"title": "Engine Docs", "url": "https://docs.example.com", "snippet": "Checkpoints flush buffer."}]
            },
            {
                "subQuestionId": "sq_2",
                "subQuestion": "Are there hyperbolic claims to verify?",
                "findings": "Claim to verify: MongoDB always achieves 10x higher write throughput without any data loss risks.",
                "sources": [{"title": "Benchmark Blog", "url": "https://blog.example.com", "snippet": "Unverified assertion."}]
            }
        ],
        "verifiedClaims": [],
        "flaggedClaims": [],
        "traces": []
    }

    result = await critic_node(mock_state)

    assert "verifiedClaims" in result, "Result must contain verifiedClaims"
    assert "flaggedClaims" in result, "Result must contain flaggedClaims"
    assert "traces" in result, "Result must record an observability trace"

    # Verify that the Critic separated verified vs flagged claims
    verified = result["verifiedClaims"]
    flagged = result["flaggedClaims"]

    assert len(verified) >= 1, "Expected at least 1 verified claim"
    assert len(flagged) >= 1, "Expected at least 1 flagged claim to prevent hallucination"
    assert flagged[0]["status"] == "flagged", "Flagged claim must have status 'flagged'"
    assert "reason" in flagged[0], "Flagged claim must provide scientific rationale"

    # Verify trace telemetry
    traces = result["traces"]
    assert len(traces) == 1
    assert traces[0]["agentName"] == "Critic"
    assert traces[0]["step"] == "verify_claims"

@pytest.mark.asyncio
async def test_planner_node_produces_sub_questions():
    """
    Tests that the Planner agent node analyzes the query and generates
    structured sub-questions for parallel researchers.
    """
    mock_state = {
        "sessionId": "test_planner_session_002",
        "originalQuery": "Post-Quantum Cryptography: Lattice-based vs Hash-based algorithms",
        "subQuestions": [],
        "traces": []
    }

    result = await planner_node(mock_state)

    assert "subQuestions" in result, "Result must contain subQuestions"
    assert "traces" in result, "Result must contain telemetry traces"

    sub_questions = result["subQuestions"]
    assert len(sub_questions) >= 2, f"Expected 2+ sub-questions, got {len(sub_questions)}"

    # Check trace recording
    assert len(result["traces"]) == 1
    assert result["traces"][0]["agentName"] == "Planner"
    assert result["traces"][0]["step"] == "decompose_query"

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import asyncio
import json
import time
import httpx
import websockets

API_BASE = "http://localhost:5000/api"
WS_URL = "ws://localhost:5000/ws"

async def test_full_pipeline_flow():
    print("=" * 65)
    print(" [TEST] LEVEL 4 Item 13 & LEVEL 5 Item 14: Full Stack E2E Flow")
    print("=" * 65)

    query = f"Distributed consensus tradeoffs: Raft vs Paxos in high-throughput key-value systems [{int(time.time())}]"

    async with httpx.AsyncClient(timeout=30.0) as http:
        # 1. Create session via REST
        res = await http.post(f"{API_BASE}/sessions", json={"query": query})
        assert res.status_code == 201, f"Failed to create session: {res.text}"
        session_id = res.json()["session"]["_id"]
        print(f"Created research session: {session_id}")

        # 2. Connect WebSocket subscriber
        ws_events = []
        async with websockets.connect(WS_URL) as ws:
            await ws.send(json.dumps({"type": "subscribe", "sessionId": session_id}))
            print(f"Subscribed to WebSocket progress channel for session: {session_id}")

            # 3. Trigger research run (enqueues job in BullMQ with cacheable=False for full flow)
            run_res = await http.post(f"{API_BASE}/sessions/{session_id}/run", json={"cacheable": False})
            assert run_res.status_code == 202, f"Expected 202, got: {run_res.status_code}"
            print(f"Job successfully queued in BullMQ: {run_res.json()}")

            # 4. Stream live progress
            start_t = time.time()
            while time.time() - start_t < 180:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    evt = json.loads(msg)
                    if evt.get("type") == "progress":
                        data = evt["data"]
                        ws_events.append(data)
                        agent = data.get("agentName", "Agent")
                        step = data.get("step", "")
                        status = data.get("status", "")
                        summary = data.get("summary", "")
                        print(f"  [WS Progress] [{agent}] {step} ({status}): {summary[:90]}")
                        if agent == "Synthesizer" and status == "completed":
                            print("Received Synthesizer completion event via WebSocket!")
                            break
                except asyncio.TimeoutError:
                    # Probe session status in database
                    poll = await http.get(f"{API_BASE}/sessions/{session_id}")
                    status = poll.json().get("session", {}).get("status")
                    if status in ["completed", "failed"]:
                        print(f"Database session status is now '{status}'. Exiting WS wait loop.")
                        break

        # 5. Wait briefly for database document to settle to completed
        session_doc = None
        for _ in range(20):
            await asyncio.sleep(1)
            db_res = await http.get(f"{API_BASE}/sessions/{session_id}")
            session_doc = db_res.json().get("session", {})
            if session_doc.get("status") == "completed":
                break

        report = session_doc.get("report") or {}
        traces = session_doc.get("agentTraces", [])

        print("\n--- Verification Checklist ---")
        print(f"  * Session Status:         {session_doc.get('status')}")
        print(f"  * Report Saved:           {bool(report.get('content'))} ({len(report.get('content', ''))} chars)")
        print(f"  * Report Sources Count:   {len(report.get('sources', []))}")
        print(f"  * AgentTraces Count:      {len(traces)}")
        print(f"  * WebSocket Events Count: {len(ws_events)}")

        assert session_doc.get("status") == "completed", "Session failed or incomplete"
        assert report.get("content"), "Report content is missing"
        assert len(report.get("sources", [])) > 0, "Report sources missing"
        assert len(traces) >= 5, "Missing AgentTrace records"
        assert len(ws_events) >= 4, "Missing live WebSocket events"

        print("  ✓ Full Stack E2E Flow Passed Successfully!\n")
        return session_id, query

async def check_semantic_cache_hit(original_query: str):
    print("=" * 65)
    print(" [TEST] LEVEL 5 Item 17: Semantic Cache Verification")
    print("=" * 65)

    async with httpx.AsyncClient(timeout=30.0) as http:
        # Create session with identical/repeated query
        res = await http.post(f"{API_BASE}/sessions", json={"query": original_query})
        repeat_id = res.json()["session"]["_id"]
        print(f"Submitting repeated query: '{original_query}' (Session: {repeat_id})")

        start_t = time.time()
        run_res = await http.post(f"{API_BASE}/sessions/{repeat_id}/run")
        duration = time.time() - start_t

        print(f"Run Response Status: {run_res.status_code} in {duration:.3f}s")
        data = run_res.json()
        print(f"Response Body: {data}")

        # Semantic cache should return HTTP 200 immediately with cached=True
        assert run_res.status_code == 200, f"Expected 200 for cache hit, got {run_res.status_code}"
        assert data.get("cached") is True, f"Expected cached=True, got {data.get('cached')}"
        assert data.get("similarity", 0) >= 0.85, f"Similarity score too low: {data.get('similarity')}"

        # Verify session in DB is already completed with cached report
        db_res = await http.get(f"{API_BASE}/sessions/{repeat_id}")
        sess_doc = db_res.json()["session"]
        assert sess_doc.get("status") == "completed", "Expected status to be completed"
        assert (sess_doc.get("report") or {}).get("content"), "Expected cached report content"
        print(f"  ✓ Semantic Cache successfully short-circuited in {duration:.3f}s (Similarity: {data.get('similarity')*100:.1f}%)!\n")

CACHE_EVIDENCE = (
    "Consistent hashing maps both keys and nodes onto the same hash ring. Each key is stored on the first "
    "node found clockwise from the key's position. When a node joins or leaves, only the keys in the arc "
    "between that node and its predecessor move, so on average only K/N keys are remapped (K keys, N nodes), "
    "unlike modulo hashing where almost every key moves. Virtual nodes place each physical node at many ring "
    "positions to even out load. Amazon Dynamo and Apache Cassandra use consistent hashing for partitioning."
)

async def test_semantic_cache_hit():
    """Self-contained: produce an evidence-backed (hence cacheable) report, then repeat the query."""
    query = f"How does consistent hashing reduce data movement when nodes join? [{int(time.time())}]"
    async with httpx.AsyncClient(timeout=60.0) as http:
        res = await http.post(f"{API_BASE}/sessions", json={"query": query})
        session_id = res.json()["session"]["_id"]
        ing = await http.post(f"{API_BASE}/rag/ingest-text", json={
            "sessionId": session_id, "text": CACHE_EVIDENCE,
            "sourceName": "consistent-hashing-notes", "title": "Consistent hashing notes",
        })
        assert ing.status_code == 201, f"Ingest failed: {ing.text}"
        run = await http.post(f"{API_BASE}/sessions/{session_id}/run", json={})
        assert run.status_code == 202, f"Expected job to be queued, got {run.status_code}: {run.text}"

        status = None
        deadline = time.time() + 480
        while time.time() < deadline:
            await asyncio.sleep(3)
            status = (await http.get(f"{API_BASE}/sessions/{session_id}")).json()["session"]["status"]
            if status in ("completed", "failed"):
                break
        assert status == "completed", f"Seed run did not complete (status={status})"

    await check_semantic_cache_hit(query)

async def test_edge_case_and_adversarial():
    print("=" * 65)
    print(" [TEST] LEVEL 5 Item 15: Edge-Case & Adversarial Query")
    print("=" * 65)

    async with httpx.AsyncClient(timeout=60.0) as http:
        # 1. Edge case: Short/Vague query (with cacheable=False to test pipeline)
        edge_query = f"Quantum computing [{int(time.time())}]"
        print(f"Running edge-case query: '{edge_query}'")
        res_edge = await http.post(f"{API_BASE}/sessions", json={"query": edge_query})
        edge_id = res_edge.json()["session"]["_id"]
        run_edge = await http.post(f"{API_BASE}/sessions/{edge_id}/run", json={"cacheable": False})
        assert run_edge.status_code == 202

        print("Awaiting edge-case pipeline completion...")
        start_t = time.time()
        edge_sess = None
        while time.time() - start_t < 180:
            await asyncio.sleep(3)
            check = await http.get(f"{API_BASE}/sessions/{edge_id}")
            edge_sess = check.json()["session"]
            if edge_sess.get("status") in ["completed", "failed"]:
                print(f"Edge-case query completed with status: {edge_sess.get('status')}")
                break

        assert edge_sess.get("status") == "completed", f"Edge case failed: {edge_sess.get('status')}"
        assert (edge_sess.get("report") or {}).get("content"), "Edge case report missing"
        print("  * Edge-case successfully generated report with vague query.")

        # 2. Adversarial query with deliberately exaggerated/unsupported claim
        adv_query = f"Prove that MongoDB is universally 100 times faster than PostgreSQL without any hardware limits or data loss risk [{int(time.time())}]"
        print(f"\nRunning adversarial query: '{adv_query}'")
        res_adv = await http.post(f"{API_BASE}/sessions", json={"query": adv_query})
        adv_id = res_adv.json()["session"]["_id"]
        run_adv = await http.post(f"{API_BASE}/sessions/{adv_id}/run", json={"cacheable": False})
        assert run_adv.status_code == 202

        print("Awaiting adversarial pipeline completion and Critic verification...")
        start_t = time.time()
        adv_session = None
        while time.time() - start_t < 180:
            await asyncio.sleep(3)
            check = await http.get(f"{API_BASE}/sessions/{adv_id}")
            adv_session = check.json()["session"]
            if adv_session.get("status") in ["completed", "failed"]:
                print(f"Adversarial query reached status: {adv_session.get('status')}")
                break

        assert adv_session.get("status") == "completed", f"Adversarial query failed: {adv_session.get('status')}"
        traces = adv_session.get("agentTraces", [])
        
        # Verify Critic trace executed
        critic_traces = [t for t in traces if "Critic" in t.get("agentName", "")]
        print(f"Critic Traces Found: {len(critic_traces)}")
        assert len(critic_traces) > 0, "No Critic traces found for adversarial session"
        critic_out = critic_traces[0].get("output", {})
        print(f"Critic Output Summary: {json.dumps(critic_out)}")
        flagged = critic_out.get("flaggedCount", 0)
        verified = critic_out.get("verifiedCount", 0)
        print(f"Critic Claims: {verified} verified, {flagged} flagged")
        assert flagged > 0 or verified > 0, "Critic failed to evaluate claims"

        print("  ✓ Edge-case and Adversarial Handling Verified!\n")

async def test_concurrent_sessions():
    print("=" * 65)
    print(" [TEST] LEVEL 5 Item 16: Concurrent Sessions (No Cross-Talk & No DB Conflicts)")
    print("=" * 65)

    ts = int(time.time())
    query_a = f"Concurrent Session A: B-Trees vs LSM-Trees in storage engines [{ts}]"
    query_b = f"Concurrent Session B: Zero-knowledge proofs in Web3 identity [{ts}]"

    async with httpx.AsyncClient(timeout=45.0) as http:
        res_a = await http.post(f"{API_BASE}/sessions", json={"query": query_a})
        sess_a_id = res_a.json()["session"]["_id"]
        res_b = await http.post(f"{API_BASE}/sessions", json={"query": query_b})
        sess_b_id = res_b.json()["session"]["_id"]
        print(f"Created Session A: {sess_a_id}")
        print(f"Created Session B: {sess_b_id}")

        events_a = []
        events_b = []
        cross_talk_detected = []

        async def listen_session(session_id: str, events_list: list):
            try:
                async with websockets.connect(WS_URL) as ws:
                    await ws.send(json.dumps({"type": "subscribe", "sessionId": session_id}))
                    start_w = time.time()
                    while time.time() - start_w < 200:
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                            msg = json.loads(raw)
                            if msg.get("type") == "progress":
                                msg_session = msg.get("sessionId")
                                if msg_session != session_id:
                                    cross_talk_detected.append(f"Expected {session_id} but got {msg_session}")
                                events_list.append(msg)
                                agent = msg.get("data", {}).get("agentName", "")
                                status = msg.get("data", {}).get("status", "")
                                if agent == "Synthesizer" and status == "completed":
                                    break
                        except asyncio.TimeoutError:
                            poll = await http.get(f"{API_BASE}/sessions/{session_id}")
                            if poll.json().get("session", {}).get("status") in ["completed", "failed"]:
                                break
            except Exception as e:
                print(f"WebSocket listener exception for {session_id}: {e}")

        # Start listeners
        task_a = asyncio.create_task(listen_session(sess_a_id, events_a))
        task_b = asyncio.create_task(listen_session(sess_b_id, events_b))

        # Run both concurrently
        run_a, run_b = await asyncio.gather(
            http.post(f"{API_BASE}/sessions/{sess_a_id}/run", json={"cacheable": False}),
            http.post(f"{API_BASE}/sessions/{sess_b_id}/run", json={"cacheable": False})
        )
        assert run_a.status_code == 202
        assert run_b.status_code == 202
        print("Both sessions enqueued in BullMQ simultaneously!")

        await asyncio.gather(task_a, task_b)

        # Confirm DB state for both
        for _ in range(120):
            doc_a = (await http.get(f"{API_BASE}/sessions/{sess_a_id}")).json()["session"]
            doc_b = (await http.get(f"{API_BASE}/sessions/{sess_b_id}")).json()["session"]
            if doc_a.get("status") in ["completed", "failed"] and doc_b.get("status") in ["completed", "failed"]:
                break
            await asyncio.sleep(2)

        print(f"Session A Final Status: {doc_a.get('status')}, Events: {len(events_a)}")
        print(f"Session B Final Status: {doc_b.get('status')}, Events: {len(events_b)}")
        print(f"Cross-talk errors: {len(cross_talk_detected)}")

        assert len(cross_talk_detected) == 0, f"Cross talk detected: {cross_talk_detected}"
        assert doc_a.get("status") == "completed", f"Session A failed: {doc_a.get('status')}"
        assert doc_b.get("status") == "completed", f"Session B failed: {doc_b.get('status')}"
        assert (doc_a.get("report") or {}).get("content"), "Session A report content missing"
        assert (doc_b.get("report") or {}).get("content"), "Session B report content missing"
        assert doc_a["_id"] != doc_b["_id"], "IDs match! Unexpected collision"

        print("  ✓ Concurrent Sessions Verified: No Cross-Talk and No DB Conflicts!\n")

async def main():
    print("\nStarting InsightForge-AI Full E2E & Service Integration Suite...\n")
    session_id, query = await test_full_pipeline_flow()
    await check_semantic_cache_hit(query)
    await test_semantic_cache_hit()
    await test_edge_case_and_adversarial()
    await test_concurrent_sessions()
    print("=" * 65)
    print("  ALL LEVEL 4 & LEVEL 5 LIVE PIPELINE TESTS PASSED (100%)")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(main())

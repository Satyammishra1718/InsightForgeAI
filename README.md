# InsightForge-AI: Autonomous Multi-Agent Deep Research Platform

> **InsightForge AI** is an autonomous, production-grade deep research engine that transforms complex technical questions into rigorous, cited, hallucination-checked intelligence briefings. Powered by a specialized multi-agent workflow running on LangGraph and Python FastAPI, hybrid BM25 + dense vector RAG, and the Model Context Protocol (MCP), it orchestrates Planner, Researcher, Critic, and Synthesizer agents with live real-time telemetry. The platform couples an asynchronous BullMQ queue, Redis pub/sub WebSocket streaming, and a sub-40ms semantic cache to deliver instant answers for recurring research topics.

---

## 🏗️ System Architecture

```
                                      +------------------------------------+
                                      |   React 19 + Tailwind Frontend     |
                                      |   (Vite dev server on Port 5173)   |
                                      +-----------------+------------------+
                                                        |
                                          HTTP / REST   |   WebSocket (/ws)
                                                        v
                                      +-----------------+------------------+
                                      |    Node.js Express Backend API     |
                                      |   (Port 5000, WebSocket at /ws)    |
                                      +--------+-----------------+---------+
                                               |                 |
                   Enqueue Research Job        |                 |  Check Semantic
                 (or immediate cache hit)      |                 |  Cache (>= 0.80)
                                               v                 v
                                      +--------+--------+  +-----+----------+
                                      |  BullMQ Queue   |  | Redis Cache &  |
                                      |   ('research')  |  | Broker (Port   |
                                      +--------+--------+  | 6379 / 6380)   |
                                               |           +-----+----------+
                          Pulls queued job     |                 ^
                                               v                 |  Pub/Sub Stream
                                      +--------+--------+        |  (session:progress)
                                      | Dedicated Node  |        |
                                      |  BullMQ Worker  |        |
                                      +--------+--------+        |
                                               |                 |
                       POST /run-research      |                 |
                                               v                 |
+----------------------------------------------+-----------------+-----------------------+
|  Python FastAPI Microservice (/agent-service on Port 8000)                             |
|                                                                                        |
|    +-------------------+       +-----------------------+       +------------------+    |
|    |   Planner Agent   | ----> | Parallel Researchers  | ----> | Critic / Verifier|    |
|    | (Deconstructs Q)  |       | (2-4 Sub-Questions)   |       | (Fact-Checking)  |    |
|    +-------------------+       +-----------+-----------+       +--------+---------+    |
|                                            |                            |              |
|                                            | MCP Tool Invocations       v              |
|                                            |                   +------------------+    |
|                                            |                   | Synthesizer Agent|    |
|                                            |                   | (Cited Markdown) |    |
|                                            |                   +------------------+    |
+--------------------------------------------|-------------------------------------------+
                                             |
                   +-------------------------+-------------------------+
                   | (Model Context Protocol / SSE)                    |
                   v                                                   v
    +------------------------------+                    +------------------------------+
    |    MCP Web Search Server     |                    |    MCP Doc Retrieval Server  |
    |   (Port 4001, Tavily / DDG)  |                    |   (Port 4002, ChromaDB+BM25) |
    +------------------------------+                    +------------------------------+
                   |                                                   |
                   +-------------------------+-------------------------+
                                             |
                                             v
                              +------------------------------+
                              |      MongoDB Database        |
                              |  (Sessions, Reports, Traces) |
                              +------------------------------+
```

---

## ⚡ Key Capabilities

- **5-Agent LangGraph Swarm**:
  - **Planner**: Deconstructs high-level prompts into 3–5 mutually exclusive, collectively exhaustive sub-questions.
  - **Parallel Researchers**: Mines dense vector embeddings and web tools concurrently via Promise/async batching.
  - **Critic / Verifier**: Cross-checks extracted claims against raw source chunks, flagging hyperbolic or unanchored claims before synthesis.
  - **Synthesizer**: Compiles publication-ready markdown briefings with verified inline citation markers `[1]`, `[2]`.
- **Model Context Protocol (MCP)**:
  - Decoupled tool servers running official `@modelcontextprotocol/sdk` over Server-Sent Events (SSE).
  - Dynamic tool discovery (`web_search` and `retrieve_context`).
- **Hybrid RAG (Dense Vectors + BM25)**:
  - Tokenizer-aware sliding-window chunking (GPT BPE tokenizer).
  - ChromaDB dense vector search fused with BM25 keyword rankings via Reciprocal Rank Fusion (RRF).
- **Asynchronous Execution & Live Telemetry**:
  - Non-blocking HTTP 202 Accepted response; jobs dispatched to BullMQ.
  - Python microservice streams step-by-step agent progress directly into Redis Pub/Sub (`session:<id>:progress`).
  - Node.js WebSocket gateway broadcasts live events to connected browser clients with zero polling overhead.
- **Sub-40ms Redis Semantic Cache**:
  - Cosine similarity matching ($\ge 0.80$) over 384-dim `all-MiniLM-L6-v2` query embeddings, computed locally in-process (no embedding API key needed; set `EMBEDDING_PROVIDER=openai` for `text-embedding-3-small`).
  - Instantaneous return of cached intelligence reports on recurring topics, cutting LLM token costs by over 90%.
- **Observability & Trace Viewer**:
  - Full audit trail (`AgentTrace` in MongoDB) capturing exact inputs, prompts, retrieved chunks, and LLM thoughts at every step.
- **Product-Grade Responsive UI**:
  - React 19, TypeScript, Tailwind CSS, shadcn/ui components, and Framer Motion spring animations.
  - Interactive citation jumping, session history, and in-app microservice system health dashboard.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js v20+ and npm v10+
- Python 3.11+
- Nothing else: Redis, MongoDB and ChromaDB start automatically for local development
  (Redis from `backend/redis-bin`, an embedded MongoDB when `FORCE_LOCAL_DB=true`, and a
  ChromaDB server from the Python virtualenv). Local data is kept under `data/` (`data/mongo`,
  `data/chroma`), so research history survives restarts.

### 1. Install

```bash
git clone https://github.com/your-username/InsightForge-AI.git
cd InsightForge-AI
npm install               # Node workspaces: backend, frontend, MCP servers
npm run setup:python      # creates agent-service/venv; installs LangGraph, FastAPI, MCP, ChromaDB
cp .env.example .env
```

### 2. Configure API keys in `.env`

```ini
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...          # https://console.groq.com/keys (free tier)
LLM_MODEL=openai/gpt-oss-120b
TAVILY_API_KEY=tvly-...       # https://app.tavily.com (free tier); powers web search
```

Embeddings need no key: `all-MiniLM-L6-v2` (384-dim) runs locally and is downloaded once
(~90MB) into `data/models` on first use.

### 3. Run everything

```bash
npm run dev
```

This starts all six processes with prefixed logs: ChromaDB, the Python agent service, both
MCP servers, the Node backend (API, WebSocket gateway and embedded BullMQ worker) and the
React frontend. Open http://localhost:5173.

| Service | URL / Port | Description |
| :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:5173` | React UI (Vite dev server; proxies `/api` and `/ws` to the backend) |
| **Backend REST API** | `http://localhost:5000` | Node.js Express server (`/api/sessions`, `/api/health`, `/api/system/status`) |
| **WebSocket Gateway** | `ws://localhost:5000/ws` | Live agent progress streaming |
| **Python Agent Service** | `http://localhost:8000` | FastAPI + LangGraph orchestration (`/health`, `/run-research`) |
| **MCP Web Search** | `http://localhost:4001/sse` | MCP tool server providing `web_search` |
| **MCP Doc Retrieval** | `http://localhost:4002/sse` | MCP tool server providing `retrieve_context` |
| **ChromaDB** | `http://localhost:8001` | Vector database (HNSW, cosine) for document chunks |
| **Redis** | `localhost:6380` | BullMQ broker, Pub/Sub and semantic cache |
| **MongoDB** | embedded or `MONGODB_URI` | Sessions, reports and agent traces |

Individual services can also be started on their own: `npm run chroma`, `npm run dev:agent`,
`npm run dev:mcp-web`, `npm run dev:mcp-doc`, `npm run dev:backend`, `npm run dev:frontend`.

---

## 🧪 Automated Testing

Both the TypeScript backend and Python microservice feature automated test suites demonstrating full cross-stack testing discipline:

### Node.js Backend Tests (RAG & API Lifecycle)
```bash
npm run test --workspace=backend
```
*Validates tokenizer-aware chunking, token boundary enforcement, `GET /api/health`, `GET /api/system/status`, and `POST /api/sessions`.*

### Python Agent Service Tests (LangGraph Nodes)
```bash
cd agent-service
pytest tests/test_agent_nodes.py -v
```
*Validates the Planner query decomposition node and Critic verification node (detecting and isolating unsupported claims).*

### End-to-End Async Pipeline Test
```bash
npm run test:async --workspace=backend
```
*Spawns concurrent sessions, verifies BullMQ parallel queue processing, independent WebSocket event streaming, MongoDB trace persistence, and semantic cache hit on duplicate queries.*

---

## 💡 "Why These Design Decisions?"

### 1. Why a Separate Python/LangGraph Microservice Instead of Node-Only?
- **State Graphs & Cyclic Flows**: LangGraph provides first-class support for cyclical graph flows, human-in-the-loop branching, and state checkpointing that is natively suited for multi-agent loops.
- **AI Ecosystem Velocity**: Python remains the center of gravity for cutting-edge LLM tooling, tokenization libraries, and prompt engineering utilities.
- **Separation of Concerns**: Node.js excels at high-throughput I/O, WebSockets, client session management, and job queue orchestration via BullMQ. Delegating computation-heavy LLM reasoning to Python while keeping I/O in Node yields optimal performance for both paradigms.

### 2. Why Model Context Protocol (MCP)?
- **Tool Interoperability**: Instead of hardcoding API integrations inside agent prompts, MCP standardizes tool schemas (`tools/list`, `tools/call`) over Server-Sent Events (SSE).
- **Security Boundaries**: Tool execution occurs in isolated processes with separate access controls, preventing untrusted tool execution from compromising core orchestrator state.
- **Polyglot Extensibility**: Any team can write an MCP server in Go, Python, or TypeScript, and the agent swarm can immediately discover and invoke it without code alterations.

### 3. Why the Critic / Verifier Agent?
- **Hallucination Defense**: Research LLMs tend to generate convincing extrapolations when summarizing large contexts. The Critic acts as an independent adversarial gate that maps every factual claim back to retrieved source chunks.
- **Durability & Caveats**: Claims that lack backing evidence or present hyperbolic generalizations (e.g. "achieves 10x throughput with zero overhead") are explicitly flagged, ensuring executive reports remain scientifically rigorous.

### 4. Why Hybrid RAG (BM25 + Dense Vectors)?
- **Complementary Strengths**: Dense semantic embeddings (cosine similarity) excel at understanding intent and thematic concepts, but often stumble on exact model numbers, error codes, and specific technical acronyms.
- **BM25 Keyword Precision**: BM25 excels at exact lexical matching. Fusing both via Reciprocal Rank Fusion (RRF) ensures the retrieval engine surfaces the most relevant chunks regardless of phrasing.

### 5. Why Semantic Caching in Redis?
- **Cost & Latency Elimination**: Repeated research on similar topics (e.g. "Kubernetes autoscaling" vs "K8s HPA scaling strategies") matches with $\ge 80\%$ cosine similarity, returning complete verified reports in $<40\text{ms}$ while completely bypassing redundant LLM calls.
- **Token Budget Protection**: Drastically decreases API spending during traffic spikes.

---

## 🔮 What We'd Add With More Time (Future Work)

1. **Multi-Turn Follow-up Q&A**:
   - Allow users to ask follow-up questions directly on an active report, leveraging conversational memory and targeted RAG retrieval over already-verified claims.
2. **Team Workspaces & RBAC**:
   - Multi-tenant authentication with Clerk/Supabase, enterprise team permissions, and shareable research workspaces.
3. **One-Click PDF & Presentation Export**:
   - Automated conversion of markdown reports into executive slide decks or branded PDF whitepapers with charts.
4. **Human-in-the-Loop Feedback (RLHF)**:
   - Allow human researchers to edit sub-questions generated by the Planner before researchers dispatch, guiding the investigation interactively.

---

## 📜 Monorepo Layout

```
InsightForge-AI/
├── agent-service/               # Python FastAPI LangGraph Microservice
│   ├── app/
│   │   ├── agents/              # Planner, Researcher, Critic, Synthesizer nodes
│   │   ├── graph/               # LangGraph StateGraph construction
│   │   ├── models/              # Pydantic state schemas
│   │   ├── tools/               # MCP Client connector
│   │   ├── utils/               # Publisher, Rate Limiter, Correlated Logger
│   │   └── main.py              # FastAPI endpoints (/health, /run-research)
│   └── tests/                   # Pytest suite for LangGraph nodes
├── backend/                     # Node.js Express REST API & WebSocket Gateway
│   ├── src/
│   │   ├── controllers/         # Sessions, Health, System Status controllers
│   │   ├── models/              # Mongoose schemas (Session, Report, AgentTrace)
│   │   ├── queue/               # BullMQ queue & worker definition
│   │   ├── rag/                 # Chunker, local MiniLM embeddings, vector store, BM25 hybrid retriever
│   │   ├── services/            # Semantic Cache (cosine similarity), Session service
│   │   ├── websocket/           # Redis Pub/Sub WebSocket streaming gateway
│   │   ├── utils/               # Pino structured logger
│   │   ├── worker.ts            # Standalone BullMQ Worker process
│   │   └── index.ts             # Server entrypoint
│   └── src/tests/               # Backend unit & integration test suite
├── frontend/                    # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/          # HeroSection, AgentsAtWork, ReportViewer, Traces
│   │   ├── hooks/               # useResearchSession (WebSocket streaming & cache)
│   │   └── App.tsx              # Main application shell & system health popover
├── mcp-servers/
│   ├── web-search/              # MCP Server: Tavily / DuckDuckGo web search
│   └── doc-retrieval/           # MCP Server: ChromaDB hybrid document retrieval
├── scripts/venv.mjs             # Runs agent-service/venv tools (uvicorn, chroma) cross-platform
├── data/                        # Local runtime data (ChromaDB, embedding model cache); gitignored
└── README.md                    # Project documentation & architectural guide
```

---

## 📄 License

MIT © InsightForge AI Team

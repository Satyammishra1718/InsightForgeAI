# InsightForge-AI

A full-stack agentic AI research platform designed for multi-agent autonomous deep research, iterative information retrieval, knowledge synthesis, and report generation.

## Architecture

InsightForge-AI is engineered as a modular monorepo comprising a reactive single-page client built with React 19, TypeScript, and Tailwind CSS; a Node.js and Express backend gateway structured cleanly into routing, controller, service, agent orchestration, model, and WebSocket streaming layers; an extensible ecosystem of Model Context Protocol (MCP) tool servers for web search and vector document retrieval; and containerized infrastructure orchestrated via Docker Compose encompassing MongoDB for persistent session state, Redis for real-time task queues, and vector storage for semantic retrieval.

```
insightforge-ai/
├── backend/               # Express + TypeScript API server & WebSocket gateway
│   ├── src/
│   │   ├── routes/        # Express route definitions (sessions, health)
│   │   ├── controllers/   # Request/response controllers
│   │   ├── services/      # Business logic & services (SessionService, HealthService)
│   │   ├── models/        # Mongoose data models (User, ResearchSession, AgentTrace, Report)
│   │   ├── middleware/    # Error handler & Zod validation middleware
│   │   ├── validators/    # Zod request validation schemas
│   │   ├── scripts/       # Database seed and test scripts
│   │   ├── agents/        # Agent orchestration layer
│   │   ├── config/        # Environment and database configuration
│   │   └── websocket/     # Real-time WebSocket streaming handlers
│   └── package.json
├── frontend/              # React + Vite + TypeScript + Tailwind CSS UI
│   ├── src/
│   └── package.json
├── mcp-servers/           # Model Context Protocol tool servers
│   ├── web-search/        # MCP server for web search & scraping
│   └── doc-retrieval/     # MCP server for document ingestion & vector search
├── docker/                # Docker configuration
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── docs/                  # Project documentation & architecture diagrams
│   ├── architecture.md
│   └── .env.example
├── .env.example           # Root environment variable template
├── package.json           # Monorepo workspaces definition
└── README.md
```

## Data Layer & Mongoose Models

The backend utilizes **Mongoose** with MongoDB to manage structured research workflows:

- **`User`**: `{ name: String, email: String, createdAt: Date }`
- **`ResearchSession`**: `{ userId?: ObjectId, query: String, status: "pending" | "in_progress" | "completed" | "failed", createdAt: Date, updatedAt: Date }`
- **`AgentTrace`**: `{ sessionId: ObjectId, agentName: String, step: Mixed, input: Mixed, output: Mixed, timestamp: Date }` (observability log for agent reasoning traces)
- **`Report`**: `{ sessionId: ObjectId, content: String, sources: [{ title, url, snippet }], createdAt: Date }`

## Resilient Multi-Network Connectivity (College WiFi vs. Hotspot)

If you are developing across multiple networks (e.g., restricted campus/college WiFi and mobile hotspots), you may encounter MongoDB Atlas connection timeouts (`Could not connect to any servers in your MongoDB Atlas cluster`) because **campus firewalls frequently block outgoing TCP port 27017 and DNS SRV lookups**.

InsightForge-AI includes an **automatic dual-mode database connection engine**:

1. **Auto-Detection & Seamless Fallback (Zero Config)**:
   - On startup, the backend probes the primary `MONGODB_URI` with a fast 3-second timeout.
   - If reachable (e.g. on mobile hotspot or unblocked network), it connects directly to your Atlas/remote cluster (`[ATLAS]` mode).
   - If blocked or unreachable (e.g. on College WiFi), it automatically catches the failure and spins up a local embedded MongoDB instance (`[EMBEDDED]` mode via `mongodb-memory-server`) with zero crashes.
   - You never have to manually edit connection strings, IPs, or `.env` files when switching networks.
2. **Auto-Seeding**:
   - When running in embedded mode with an empty database, the backend automatically seeds demo sessions, reports, and agent traces so the frontend and API always have data ready to display.
3. **Optional Fast-Start Flag**:
   - If you know you are on College WiFi and want to bypass the 3-second Atlas probe for instant startup:
     ```env
     FORCE_LOCAL_DB=true
     ```
   - Simply omit or set to `false` when switching back to a network with Atlas access.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [npm](https://www.npmjs.com/) (v10+)
- [MongoDB](https://www.mongodb.com/) (Optional: remote Atlas URI, local daemon, or automated embedded fallback)

### 1. Installation

Clone the repository and install all workspace dependencies from the root:

```bash
git clone <repository-url>
cd insightforge-ai
npm install
```

### 2. Environment Setup

Copy the template `.env.example` to `.env` in the root:

```bash
cp .env.example .env
```

Ensure the configuration variables match your local environment:

- `PORT=5000` (Backend API)
- `WS_PORT=5001` (WebSocket Server)
- `MONGODB_URI=mongodb://localhost:27017/insightforge` (or MongoDB Atlas connection string)
- `REDIS_URL=redis://localhost:6379`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (for future agent integration)

### 3. Database Seeding & Testing

Seed the database with sample research sessions, reports, and agent traces:

```bash
npm run seed
```

Run the end-to-end API test suite (verifying Mongoose models, validation, and all REST endpoints):

```bash
npm run test:api
```

### 4. Running Locally (Development)

Run both backend and frontend concurrently with a single command from the monorepo root:

```bash
npm run dev
```

Or run services individually:

- **Backend only**:

  ```bash
  npm run dev:backend
  ```

  Runs at [http://localhost:5000](http://localhost:5000).

- **Frontend only**:
  ```bash
  npm run dev:frontend
  ```
  Runs at [http://localhost:5173](http://localhost:5173) with automatic proxying to backend `/api`.

### 5. Running with Docker Compose

To spin up the entire stack including MongoDB and Redis:

```bash
docker compose up --build
```

### 6. Code Quality & Formatting

Run linting across all workspace packages:

```bash
npm run lint
```

Format code using Prettier:

```bash
npm run format
```

---

## REST API Reference & cURL Examples

All routes return standard JSON responses. Errors follow a consistent structure:

```json
{
  "error": {
    "message": "Detailed error message",
    "code": "ERROR_CODE"
  }
}
```

### 1. Health Check

```bash
curl -X GET http://localhost:5000/api/health
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-09-25T22:14:38.608Z",
  "uptime": 42.5,
  "environment": "development"
}
```

### 2. Create Research Session

Creates a new research session with status `"pending"`.

```bash
curl -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"query": "Investigation into neuromorphic visual cortex algorithms"}'
```

**Response (201 Created):**

```json
{
  "session": {
    "_id": "6ab6f24fad6ecd8a4315becc",
    "query": "Investigation into neuromorphic visual cortex algorithms",
    "status": "pending",
    "createdAt": "2026-09-25T22:14:39.224Z",
    "updatedAt": "2026-09-25T22:14:39.224Z"
  }
}
```

**Validation Error Example (Empty query):**

```bash
curl -X POST http://localhost:5000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"query": ""}'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "message": "query: Query cannot be empty",
    "code": "VALIDATION_ERROR"
  }
}
```

### 3. List Research Sessions (Paginated)

Lists research sessions sorted most recent first.

```bash
curl -X GET "http://localhost:5000/api/sessions?page=1&limit=10"
```

**Response (200 OK):**

```json
{
  "sessions": [
    {
      "_id": "6ab6f24fad6ecd8a4315becc",
      "query": "Investigation into neuromorphic visual cortex algorithms",
      "status": "pending",
      "createdAt": "2026-09-25T22:14:39.224Z",
      "updatedAt": "2026-09-25T22:14:39.224Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

### 4. Get Session by ID (With Report & Agent Traces)

Retrieves a specific session including its synthesized report and chronological agent execution traces.

```bash
curl -X GET http://localhost:5000/api/sessions/6ab6f24ead6ecd8a4315bebe
```

**Response (200 OK):**

```json
{
  "session": {
    "_id": "6ab6f24ead6ecd8a4315bebe",
    "query": "Quantum error correction thresholds and lattice surgery in surface codes",
    "status": "completed",
    "createdAt": "2026-09-25T22:14:38.800Z",
    "updatedAt": "2026-09-25T22:14:38.800Z",
    "report": {
      "_id": "6ab6f24ead6ecd8a4315bec2",
      "sessionId": "6ab6f24ead6ecd8a4315bebe",
      "content": "# Surface Code Quantum Error Correction: State of the Art...",
      "sources": [
        {
          "title": "Physical Review A - Fault-Tolerant Surface Codes",
          "url": "https://journals.aps.org/pra/quantum-surface-codes",
          "snippet": "Comprehensive analysis of threshold limits..."
        }
      ]
    },
    "agentTraces": [
      {
        "_id": "6ab6f24ead6ecd8a4315bebf",
        "sessionId": "6ab6f24ead6ecd8a4315bebe",
        "agentName": "OrchestratorAgent",
        "step": 1,
        "input": { "query": "Quantum error correction thresholds..." },
        "output": { "strategy": "literature_decomposition" },
        "timestamp": "2026-09-25T22:14:38.810Z"
      }
    ]
  }
}
```

### 5. Delete Session

Deletes a session and its associated reports and agent traces.

```bash
curl -X DELETE http://localhost:5000/api/sessions/6ab6f24fad6ecd8a4315becc
```

**Response (200 OK):**

```json
{
  "message": "Research session and associated traces/reports deleted successfully",
  "id": "6ab6f24fad6ecd8a4315becc"
}
```

**Non-Existent Session (404 Not Found):**

```bash
curl -X GET http://localhost:5000/api/sessions/6ab6f24fad6ecd8a4315becc
```

**Response (404 Not Found):**

```json
{
  "error": {
    "message": "Research session with ID '6ab6f24fad6ecd8a4315becc' not found",
    "code": "NOT_FOUND"
  }
}
```

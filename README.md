# InsightForge-AI

A full-stack agentic AI research platform designed for multi-agent autonomous deep research, iterative information retrieval, knowledge synthesis, and report generation.

## Architecture

InsightForge-AI is engineered as a modular monorepo comprising a reactive single-page client built with React 19, TypeScript, and Tailwind CSS; a Node.js and Express backend gateway structured cleanly into routing, controller, service, agent orchestration, model, and WebSocket streaming layers; an extensible ecosystem of Model Context Protocol (MCP) tool servers for web search and vector document retrieval; and containerized infrastructure orchestrated via Docker Compose encompassing MongoDB for persistent session state, Redis for real-time task queues, and vector storage for semantic retrieval.

```
insightforge-ai/
├── backend/               # Express + TypeScript API server & WebSocket gateway
│   ├── src/
│   │   ├── routes/        # Express route definitions
│   │   ├── controllers/   # Request/response controllers
│   │   ├── services/      # Business logic & services
│   │   ├── agents/        # Agent orchestration layer
│   │   ├── models/        # Data models and interfaces
│   │   ├── config/        # Environment and app configuration
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

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [npm](https://www.npmjs.com/) (v10+)
- [Docker](https://www.docker.com/) (optional, for containerized services)

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
- `MONGODB_URI=mongodb://localhost:27017/insightforge`
- `REDIS_URL=redis://localhost:6379`
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (for future agent integration)

### 3. Running Locally (Development)

Run both backend and frontend concurrently with a single command from the monorepo root:

```bash
npm run dev
```

Or run services individually:

- **Backend only**:

  ```bash
  npm run dev:backend
  ```

  Runs at [http://localhost:5000](http://localhost:5000) (Health check: [http://localhost:5000/api/health](http://localhost:5000/api/health)).

- **Frontend only**:
  ```bash
  npm run dev:frontend
  ```
  Runs at [http://localhost:5173](http://localhost:5173) with automatic proxying to backend `/api`.

### 4. Running with Docker Compose

To spin up the entire multi-service stack (frontend, backend, MongoDB, Redis):

```bash
docker compose up --build
```

### 5. Code Quality & Formatting

Run linting across all workspace packages:

```bash
npm run lint
```

Format code using Prettier:

```bash
npm run format
```

## API Endpoints

- `GET /` — API service info & version
- `GET /api/health` — System health check (`{ status: "ok", timestamp, uptime, environment }`)
- `WS /ws` — WebSocket gateway for streaming real-time agent execution events

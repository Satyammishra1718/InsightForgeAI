# InsightForge-AI Architecture

InsightForge-AI is an end-to-end agentic AI research platform designed to automate deep information retrieval, synthesis, and knowledge verification across disparate web and document corpora.

## System Architecture Diagram

```mermaid
graph TD
    subgraph Client["Client Tier"]
        UI["React 19 + Vite Frontend<br/>(Tailwind CSS, TypeScript)"]
    end

    subgraph Gateway["Backend Gateway & API Tier"]
        Express["Express.js HTTP Server<br/>(REST API /api/health)"]
        WS["WebSocket Server<br/>(/ws real-time agent streams)"]
    end

    subgraph AgentLayer["Agentic Orchestration Tier"]
        Orchestrator["Orchestrator Agent"]
        SearchAgent["Web Search Agent"]
        DocAgent["Document Retrieval Agent"]
        SynthesisAgent["Report Synthesis Agent"]
    end

    subgraph MCPTier["Model Context Protocol (MCP) Tool Servers"]
        MCPWeb["mcp-servers/web-search<br/>(Brave / Tavily / Serper)"]
        MCPDoc["mcp-servers/doc-retrieval<br/>(PDF, Markdown, Semantic Search)"]
    end

    subgraph Persistence["Storage & Caching Tier"]
        Mongo[("MongoDB<br/>(Sessions, Artifacts, Metadata)")]
        Redis[("Redis<br/>(PubSub, Agent Task Queue, Cache)")]
        VectorStore[("Vector DB<br/>(Embeddings & Hybrid Search)")]
    end

    UI <-->|HTTP / REST| Express
    UI <-->|WebSocket Stream| WS

    Express --> Orchestrator
    WS --> Orchestrator

    Orchestrator --> SearchAgent
    Orchestrator --> DocAgent
    Orchestrator --> SynthesisAgent

    SearchAgent <-->|MCP Protocol| MCPWeb
    DocAgent <-->|MCP Protocol| MCPDoc

    Orchestrator <--> Mongo
    Orchestrator <--> Redis
    DocAgent <--> VectorStore
```

## Directory Mapping

- **`/frontend`**: React 19 application powered by Vite, Tailwind CSS, and TypeScript.
- **`/backend`**: Modular Node.js + Express + TypeScript service handling API routing, WebSocket sessions, and agent orchestration.
- **`/mcp-servers`**: Modular tool servers adhering to the Model Context Protocol standard.
- **`/docker`**: Multi-container Docker Compose definitions for reproducible local orchestration.
- **`/docs`**: Architectural specifications, schematics, and configuration guides.

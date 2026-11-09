import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend or root if present
current_dir = Path(__file__).resolve().parent
root_env = current_dir.parent.parent / '.env'
backend_env = current_dir.parent.parent / 'backend' / '.env'

if root_env.exists():
    load_dotenv(root_env)
if backend_env.exists():
    load_dotenv(backend_env)
load_dotenv()

class Settings:
    PORT: int = int(os.getenv("AGENT_SERVICE_PORT", "8000"))
    HOST: str = os.getenv("AGENT_SERVICE_HOST", "0.0.0.0")
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:5000")
    
    # LLM Provider & Keys
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq").lower().strip()
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "").strip()
    GROQ_BASE_URL: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").strip()
    
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "").strip()
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "").strip()
    
    LLM_MODEL: str = os.getenv("LLM_MODEL", "openai/gpt-oss-120b").strip()
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "").strip()

    # MCP tool servers (SSE endpoints). Leave empty to disable MCP and call tools directly.
    MCP_WEB_SEARCH_URL: str = os.getenv("MCP_WEB_SEARCH_URL", "http://127.0.0.1:4001/sse").strip()
    MCP_DOC_RETRIEVAL_URL: str = os.getenv("MCP_DOC_RETRIEVAL_URL", "http://127.0.0.1:4002/sse").strip()
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6380").strip()

    # Offline demo mode: when no LLM key is configured the agents return canned,
    # deterministic output. This must be opted into explicitly so a missing key
    # never silently produces fake reports.
    ALLOW_MOCK_LLM: bool = os.getenv("ALLOW_MOCK_LLM", "false").strip().lower() in ("1", "true", "yes")

settings = Settings()

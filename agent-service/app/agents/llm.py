import os
import json
import time
import logging
from typing import Optional, Any, Tuple
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage
from ..config import settings

logger = logging.getLogger("agent-service.llm")

_cached_effective_model: Optional[str] = None

def is_real_llm_configured() -> bool:
    """
    Returns True if a real, valid LLM provider and non-placeholder API key are configured.
    """
    provider = settings.LLM_PROVIDER.lower().strip()
    if provider == "groq":
        key = settings.GROQ_API_KEY.strip()
        return bool(key and "your_" not in key and "placeholder" not in key and key != "none")
    elif provider == "openai":
        key = settings.OPENAI_API_KEY.strip()
        return bool(key and "your_" not in key and "placeholder" not in key and key != "none")
    return False

def get_effective_model() -> str:
    """
    Returns the resolved model name. For Groq, verifies that the requested model exists
    in the active registry; if not (e.g. llama-3.3-70b-versatile retired or unavailable on tier),
    routes to the flagship chat model (openai/gpt-oss-120b).
    """
    global _cached_effective_model
    if _cached_effective_model is not None:
        return _cached_effective_model

    req_model = settings.LLM_MODEL
    provider = settings.LLM_PROVIDER.lower().strip()

    if provider == "groq" and is_real_llm_configured():
        try:
            import requests
            r = requests.get(
                f"{settings.GROQ_BASE_URL.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                timeout=5.0
            )
            if r.status_code == 200:
                avail = [m.get("id") for m in r.json().get("data", []) if m.get("id")]
                if req_model in avail:
                    _cached_effective_model = req_model
                else:
                    for candidate in ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]:
                        if candidate in avail:
                            _cached_effective_model = candidate
                            logger.info(
                                f"[Groq Registry] Requested model '{req_model}' not found in active Groq model registry. "
                                f"Auto-routing to active Groq chat model '{candidate}'."
                            )
                            return _cached_effective_model
                    _cached_effective_model = avail[0] if avail else req_model
            else:
                _cached_effective_model = req_model
        except Exception as e:
            logger.warning(f"[Groq Registry] Could not query model registry ({e}). Using '{req_model}'.")
            _cached_effective_model = req_model
        return _cached_effective_model

    _cached_effective_model = req_model
    return _cached_effective_model

def get_llm_provider_info() -> Tuple[str, str]:
    """Returns (provider, model)"""
    return settings.LLM_PROVIDER.lower().strip(), get_effective_model()

def get_chat_model(temperature: float = 0.2) -> Optional[ChatOpenAI]:
    """
    Instantiates an OpenAI-compatible ChatOpenAI client for Groq or OpenAI.
    Returns None only if no real LLM key is configured.
    """
    if not is_real_llm_configured():
        return None

    provider = settings.LLM_PROVIDER.lower().strip()
    model_name = get_effective_model()

    if provider == "groq":
        base_url = settings.GROQ_BASE_URL
        api_key = settings.GROQ_API_KEY
    else:
        base_url = settings.OPENAI_BASE_URL or None
        api_key = settings.OPENAI_API_KEY

    try:
        kwargs: dict[str, Any] = {
            "model": model_name,
            "temperature": temperature,
            "api_key": api_key,
            "request_timeout": 60,
            "max_retries": 8,
        }
        if base_url:
            kwargs["base_url"] = base_url

        return ChatOpenAI(**kwargs)
    except Exception as e:
        logger.error(f"Failed to initialize ChatOpenAI for provider={provider}, model={model_name}: {e}")
        if is_real_llm_configured():
            raise
        return None

async def invoke_llm(
    llm: ChatOpenAI,
    messages: list[BaseMessage],
    agent_name: str
) -> Any:
    """
    Executes a real LLM call with explicit pre- and post-call logging:
    - Provider name (e.g. GROQ)
    - Model name (e.g. openai/gpt-oss-120b or llama-3.3-70b-versatile)
    - Latency timing in seconds
    - Response length in characters
    """
    provider, model = get_llm_provider_info()
    logger.info(
        f"[{agent_name}] >>> REAL LLM CALL START | Provider: {provider.upper()} | "
        f"Model: {model} | Messages: {len(messages)}"
    )
    start_time = time.time()
    try:
        response = await llm.ainvoke(messages)
        duration = time.time() - start_time
        content_len = len(response.content) if hasattr(response, 'content') else 0
        logger.info(
            f"[{agent_name}] <<< REAL LLM CALL COMPLETE | Provider: {provider.upper()} | "
            f"Model: {model} | Duration: {duration:.2f}s | Output: {content_len} chars"
        )
        return response
    except Exception as e:
        duration = time.time() - start_time
        logger.error(
            f"[{agent_name}] !!! REAL LLM CALL FAILED | Provider: {provider.upper()} | "
            f"Model: {model} | Duration: {duration:.2f}s | Error: {e}"
        )
        raise

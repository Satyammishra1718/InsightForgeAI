import json
import re
import logging
from typing import Any, Optional, Dict, List, Tuple

logger = logging.getLogger("agent-service.json-cleaner")

def parse_json_safely(text: str) -> Optional[Any]:
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    # Try 1: Direct json loads
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Try 2: Extract between first { and last }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace:last_brace+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    # Try 3: Extract between first [ and last ]
    first_bracket = cleaned.find("[")
    last_bracket = cleaned.rfind("]")
    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        candidate = cleaned[first_bracket:last_bracket+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass

    return None

def extract_claims_from_raw_text(text: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Robust fallback to extract verified and flagged claims if LLM produced partial or unclosed JSON.
    """
    verified: List[Dict[str, Any]] = []
    flagged: List[Dict[str, Any]] = []
    
    # Regex matching "claim": "...", "status": "..."
    pattern = re.compile(
        r'"claim"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*,\s*"status"\s*:\s*"(verified|flagged)"(?:\s*,\s*"reason"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)")?',
        re.DOTALL
    )
    for match in pattern.finditer(text):
        claim_text, status, reason = match.groups()
        item = {
            "claim": claim_text.replace(r'\"', '"').strip(),
            "status": status.strip(),
            "reason": (reason or "Evaluated against technical documentation").replace(r'\"', '"').strip(),
            "sources": []
        }
        if status.lower() == "flagged":
            flagged.append(item)
        else:
            verified.append(item)
            
    return verified, flagged

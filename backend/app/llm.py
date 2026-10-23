"""Thin wrapper over any OpenAI-compatible chat endpoint (FreeLLMAPI, Groq, Gemini, OpenRouter...)."""
import json
import re
import time

from openai import APIConnectionError, AuthenticationError, OpenAI

from . import config

_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=config.LLM_BASE_URL,
            api_key=config.LLM_API_KEY or "not-needed",
            timeout=config.LLM_TIMEOUT,
            max_retries=0,
        )
    return _client


_status: tuple[float, bool] = (0.0, False)


def is_available(max_age: float = 30.0) -> bool:
    """Ping the endpoint, caching the result so health checks stay fast."""
    global _status
    checked_at, ok = _status
    if time.time() - checked_at < max_age:
        return ok
    try:
        client().with_options(timeout=5).models.list()
        ok = True
    except Exception:
        ok = False
    _status = (time.time(), ok)
    return ok


def parse_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply (handles ```json fences and chatter)."""
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def chat_json(system: str, user: str, retries: int = 4, temperature: float = 0.1) -> tuple[dict, dict]:
    """Call the model and return (parsed_json, usage). Retries with backoff on rate limits and bad JSON."""
    delay = 2.0
    last_error: Exception | None = None
    for _ in range(retries):
        try:
            resp = client().chat.completions.create(
                model=config.LLM_MODEL,
                temperature=temperature,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            content = resp.choices[0].message.content or ""
            usage = {
                "model": resp.model,
                "prompt_tokens": getattr(resp.usage, "prompt_tokens", None),
                "completion_tokens": getattr(resp.usage, "completion_tokens", None),
            }
            return parse_json(content), usage
        except (APIConnectionError, AuthenticationError):
            raise  # endpoint down or bad key: retrying won't help
        except Exception as exc:  # rate limits, timeouts, malformed JSON
            last_error = exc
            time.sleep(delay)
            delay = min(delay * 2, 30)
    raise RuntimeError(f"LLM call failed after {retries} attempts: {last_error}")

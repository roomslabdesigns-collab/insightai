"""Thin wrapper over OpenAI-compatible chat endpoints (Groq, Gemini, OpenRouter...).

Models are grouped by provider in priority order: the primary provider (LLM_*) first, then the optional
backup (GEMINI_*). Calls rotate between the models of the first provider that has one available, and a
model that hits its rate limit is skipped until its cooldown ends, so free-tier limits add up.
"""
import json
import re
import threading
import time
from dataclasses import dataclass

from openai import APIConnectionError, AuthenticationError, OpenAI, RateLimitError

from . import config


@dataclass(frozen=True)
class Endpoint:
    provider: str
    model: str
    client: OpenAI


def _make_client(base_url: str, api_key: str) -> OpenAI:
    return OpenAI(base_url=base_url, api_key=api_key or "not-needed", timeout=config.LLM_TIMEOUT, max_retries=0)


_groups: list[list[Endpoint]] | None = None


def groups() -> list[list[Endpoint]]:
    global _groups
    if _groups is None:
        _groups = []
        primary = _make_client(config.LLM_BASE_URL, config.LLM_API_KEY)
        _groups.append([Endpoint("primary", m, primary) for m in config.LLM_MODELS])
        if config.GEMINI_API_KEY and config.GEMINI_MODELS:
            gemini = _make_client(config.GEMINI_BASE_URL, config.GEMINI_API_KEY)
            _groups.append([Endpoint("gemini", m, gemini) for m in config.GEMINI_MODELS])
    return _groups


def client() -> OpenAI:
    return groups()[0][0].client


_status: tuple[float, bool] = (0.0, False)


def is_available(max_age: float = 30.0) -> bool:
    """True if any provider answers. Cached so health checks stay fast."""
    global _status
    checked_at, ok = _status
    if time.time() - checked_at < max_age:
        return ok
    ok = False
    for group in groups():
        try:
            group[0].client.with_options(timeout=5).models.list()
            ok = True
            break
        except Exception:
            continue
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


_lock = threading.Lock()
_next: dict[int, int] = {}
_cooldown: dict[str, float] = {}


def _pick() -> Endpoint | None:
    with _lock:
        now = time.time()
        for g, group in enumerate(groups()):
            for _ in range(len(group)):
                i = _next.get(g, 0)
                _next[g] = i + 1
                ep = group[i % len(group)]
                if _cooldown.get(ep.model, 0) <= now:
                    return ep
    return None


def _model_options(model: str) -> dict:
    # Reasoning models spend extra tokens "thinking"; keep that minimal for labelling and short answers
    if "gpt-oss" in model or "gemini" in model:
        return {"reasoning_effort": "low"}
    if "qwen3" in model:
        return {"reasoning_effort": "none"}
    return {}


def chat_json(system: str, user: str, retries: int = 6, temperature: float = 0.1) -> tuple[dict, dict]:
    """Call a model and return (parsed_json, usage). Fails over between models and providers."""
    last_error: Exception | None = None
    attempts = 0
    while attempts < retries:
        ep = _pick()
        if ep is None:  # every model is cooling down: wait, without using up an attempt
            wait = min(_cooldown.values()) - time.time()
            if wait > 600:
                raise RuntimeError("All models are out of quota (daily limit). Try again later.")
            time.sleep(max(1.0, wait))
            continue
        attempts += 1
        try:
            resp = ep.client.chat.completions.create(
                model=ep.model,
                temperature=temperature,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                **_model_options(ep.model),
            )
            content = resp.choices[0].message.content or ""
            usage = {
                "model": resp.model,
                "provider": ep.provider,
                "prompt_tokens": getattr(resp.usage, "prompt_tokens", None),
                "completion_tokens": getattr(resp.usage, "completion_tokens", None),
            }
            return parse_json(content), usage
        except AuthenticationError as exc:  # bad key for this provider: stop using it
            last_error = exc
            _cooldown[ep.model] = time.time() + 3600
            attempts -= 1
        except APIConnectionError as exc:
            last_error = exc
            _cooldown[ep.model] = time.time() + 60
            attempts -= 1
        except RateLimitError as exc:
            last_error = exc
            text = str(exc)
            if "Request too large" in text or "per day" in text or "PerDay" in text:  # skip for an hour
                _cooldown[ep.model] = time.time() + 3600
            else:
                wait = float(exc.response.headers.get("retry-after", 20) or 20)
                _cooldown[ep.model] = time.time() + min(wait, 120)
            attempts -= 1  # rate limits are expected on free tiers; only real failures count
        except Exception as exc:  # timeouts, malformed JSON, 503 overload: try the next model
            last_error = exc
            time.sleep(1)
    raise RuntimeError(f"LLM call failed after {retries} attempts: {last_error}")

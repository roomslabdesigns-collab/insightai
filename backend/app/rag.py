"""Evidence-grounded answers: retrieve -> generate structured JSON -> verify citations -> human-review checks."""
import time
from collections import Counter

from . import config, llm
from .retrieval import retrieve

SYSTEM_PROMPT = """You are InsightAI, a product-feedback analyst for product managers.
Rules:
- Use ONLY the customer feedback provided. Never invent facts, numbers, or quotes.
- Cite evidence by its id (e.g. R00012). Every claim must be backed by at least one cited id.
- If the feedback does not answer the question, say so and set confidence to "low".
- Be concise and specific. Do not generalise from one review to all users.
Respond with JSON only:
{"insight": "2-4 sentence answer",
 "themes": ["main themes involved"],
 "affected_segments": ["SMB" | "Mid-Market" | "Enterprise"],
 "severity": "low" | "medium" | "high",
 "evidence_ids": ["R00012", "..."],
 "opportunity": "one concrete product action this suggests",
 "confidence": "low" | "medium" | "high"}"""

# Cross-encoder (ms-marco) logits above this mean "on topic"
RELEVANCE_THRESHOLD = 0.0


def _evidence_block(evidence: list[dict]) -> str:
    return "\n".join(
        f"[{e['id']}] ({e['star']}★, {e['sentiment']}, {e['theme']}, {e['segment']}, {e['date']}) {e['text'][:500]}"
        for e in evidence
    )


def _extractive(evidence: list[dict]) -> dict:
    """Fallback when the LLM is unreachable: summarise the retrieved evidence without generation."""
    themes = Counter(e["theme"] for e in evidence)
    sentiments = Counter(e["sentiment"] for e in evidence)
    top_theme, n = themes.most_common(1)[0]
    severities = Counter(e["severity"] for e in evidence)
    return {
        "insight": (
            f"LLM unavailable, so this is an extractive summary. {n} of the {len(evidence)} most relevant reviews "
            f"are about {top_theme}; sentiment is mostly {sentiments.most_common(1)[0][0]}. "
            "Read the cited evidence below."
        ),
        "themes": [t for t, _ in themes.most_common(3)],
        "affected_segments": sorted({e["segment"] for e in evidence}),
        "severity": severities.most_common(1)[0][0],
        "evidence_ids": [e["id"] for e in evidence[:5]],
        "opportunity": f"Investigate {top_theme.lower()} issues raised in the cited reviews.",
        "confidence": "low",
    }


def _review_flags(answer: dict, evidence: list[dict], relevant: int, cited: list[str]) -> list[str]:
    reasons = []
    if relevant < config.MIN_EVIDENCE:
        reasons.append(f"Insufficient evidence: only {relevant} strongly relevant reviews found.")
    sentiments = Counter(e["sentiment"] for e in evidence)
    if evidence and min(sentiments["positive"], sentiments["negative"]) / len(evidence) >= 0.3:
        reasons.append("Conflicting feedback: evidence is split between positive and negative.")
    if answer.get("confidence") == "low":
        reasons.append("Low model confidence.")
    if len(cited) < 2:
        reasons.append("Weak evidence: fewer than 2 reviews cited.")
    cited_arr = sum({e["customer_id"]: e["arr"] for e in evidence if e["id"] in cited}.values())
    if answer.get("severity") == "high" and cited_arr >= 200_000:
        reasons.append(f"High-impact recommendation: ${cited_arr / 1000:.0f}K ARR in cited accounts.")
    return reasons


def answer(question: str, filters: dict | None = None) -> dict:
    t0 = time.perf_counter()
    evidence, stats = retrieve(question, filters=filters)
    retrieval_ms = (time.perf_counter() - t0) * 1000

    if not evidence:
        return {
            "question": question,
            "answer": {
                "insight": "No relevant customer feedback was found for this question.",
                "themes": [], "affected_segments": [], "severity": "low", "evidence_ids": [],
                "opportunity": "", "confidence": "low",
            },
            "evidence": [],
            "review": {"needs_human_review": True, "reasons": ["No relevant feedback found."]},
            "meta": {"mode": "none", "retrieval": stats, "latency_ms": round(retrieval_ms)},
        }

    relevant = sum(e["score"] > RELEVANCE_THRESHOLD for e in evidence) if stats["reranked"] else len(evidence)
    usage, mode = {}, "llm"
    try:
        user = f"Question: {question}\n\nCustomer feedback:\n{_evidence_block(evidence)}"
        result, usage = llm.chat_json(SYSTEM_PROMPT, user, retries=2)
    except Exception:
        result, mode = _extractive(evidence), "extractive"

    # Grounding check: drop any citation that was not in the retrieved evidence
    ids = {e["id"] for e in evidence}
    cited = [i for i in result.get("evidence_ids", []) if i in ids]
    result["evidence_ids"] = cited
    result.setdefault("confidence", "low")
    reasons = _review_flags(result, evidence, relevant, cited)

    return {
        "question": question,
        "answer": result,
        "evidence": [{**e, "cited": e["id"] in cited} for e in evidence],
        "review": {"needs_human_review": bool(reasons), "reasons": reasons},
        "meta": {
            "mode": mode,
            "retrieval": {**stats, "relevant": relevant, "latency_ms": round(retrieval_ms)},
            "llm": usage,
            "latency_ms": round((time.perf_counter() - t0) * 1000),
        },
    }

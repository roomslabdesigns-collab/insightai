"""Hybrid retrieval: dense vectors (Pinecone/local) + BM25 keywords, fused with RRF, then cross-encoder rerank."""
import re
from functools import lru_cache

from rank_bm25 import BM25Okapi

from . import config, db, embeddings
from .vectorstore import get_store

RRF_K = 60
FILTER_KEYS = {"theme", "sentiment", "severity", "segment"}
_TOKEN = re.compile(r"[a-z0-9']+")


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


@lru_cache(maxsize=1)
def _bm25() -> tuple[BM25Okapi | None, list[dict]]:
    rows = db.query("SELECT id, text, theme, sentiment, severity, segment FROM reviews WHERE enriched_by IS NOT NULL")
    if not rows:
        return None, []
    return BM25Okapi([_tokens(r["text"]) for r in rows]), rows


def reset_cache() -> None:
    _bm25.cache_clear()


def _keyword_search(query: str, top_k: int, filters: dict) -> list[str]:
    bm25, rows = _bm25()
    if bm25 is None:
        return []
    scores = bm25.get_scores(_tokens(query))
    ranked = sorted(range(len(rows)), key=lambda i: -scores[i])
    out = []
    for i in ranked:
        if scores[i] <= 0 or len(out) >= top_k:
            break
        if all(rows[i].get(k) == v for k, v in filters.items()):
            out.append(rows[i]["id"])
    return out


def retrieve(query: str, top_k: int = config.TOP_K, filters: dict | None = None,
             mode: str = "hybrid_rerank") -> tuple[list[dict], dict]:
    """mode: "dense" | "hybrid" | "hybrid_rerank" (the eval script compares all three)."""
    filters = {k: v for k, v in (filters or {}).items() if k in FILTER_KEYS and v}
    dense = [id_ for id_, _ in get_store().search(embeddings.embed_query(query), config.CANDIDATES, filters)]
    keyword = _keyword_search(query, config.CANDIDATES, filters) if mode != "dense" else []

    fused: dict[str, float] = {}
    for ranking in (dense, keyword):
        for rank, id_ in enumerate(ranking):
            fused[id_] = fused.get(id_, 0.0) + 1.0 / (RRF_K + rank + 1)
    candidates = sorted(fused, key=lambda i: -fused[i])[: max(top_k * 3, 20)]
    reviews = db.get_reviews(candidates)
    candidates = [c for c in candidates if c in reviews]

    reranked = mode == "hybrid_rerank" and config.USE_RERANKER and len(candidates) > 1
    if reranked:
        scores = embeddings.rerank(query, [reviews[c]["text"] for c in candidates])
        order = sorted(zip(candidates, scores), key=lambda x: -x[1])
    else:
        order = [(c, fused[c]) for c in candidates]

    results = [{**reviews[id_], "score": round(score, 4)} for id_, score in order[:top_k]]
    stats = {"dense_hits": len(dense), "keyword_hits": len(keyword), "fused": len(fused), "reranked": reranked}
    return results, stats

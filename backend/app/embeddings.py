"""Local embedding + reranking models (fastembed / ONNX, CPU-only, free)."""
from functools import lru_cache

import numpy as np

from . import config

# bge models expect this prefix on the query side only
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
MODEL_CACHE = config.DATA_DIR / "models"


@lru_cache(maxsize=1)
def _embedder():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=config.EMBED_MODEL, cache_dir=str(MODEL_CACHE))


@lru_cache(maxsize=1)
def _reranker():
    from fastembed.rerank.cross_encoder import TextCrossEncoder

    return TextCrossEncoder(model_name=config.RERANK_MODEL, cache_dir=str(MODEL_CACHE))


def embed_documents(texts: list[str], batch_size: int = 128) -> np.ndarray:
    return np.array(list(_embedder().embed(texts, batch_size=batch_size)), dtype=np.float32)


def embed_query(text: str) -> np.ndarray:
    return np.array(next(iter(_embedder().embed([QUERY_PREFIX + text]))), dtype=np.float32)


def rerank(query: str, docs: list[str]) -> list[float]:
    if not docs:
        return []
    return [float(s) for s in _reranker().rerank(query, docs)]

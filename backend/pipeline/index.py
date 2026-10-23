"""Step 3: embed every enriched review locally and upsert it into the vector store (Pinecone or local).

Embeddings are cached in data/embeddings.npz, so re-indexing (new labels, or switching to Pinecone)
only embeds reviews that are new.
"""
import time

import numpy as np

from app import config, db, embeddings
from app.vectorstore import get_store

CACHE_PATH = config.DATA_DIR / "embeddings.npz"


def _cached_vectors(rows: list[dict]) -> np.ndarray:
    cache: dict[str, np.ndarray] = {}
    if CACHE_PATH.exists():
        with np.load(CACHE_PATH, allow_pickle=True) as data:
            cache = dict(zip(data["ids"], data["vectors"]))
    missing = [r for r in rows if r["id"] not in cache]
    if missing:
        started = time.time()
        for r, vec in zip(missing, embeddings.embed_documents([r["text"] for r in missing])):
            cache[r["id"]] = vec
        print(f"Embedded {len(missing):,} new reviews in {time.time() - started:.0f}s")
        np.savez(CACHE_PATH, ids=np.array(list(cache), dtype=object), vectors=np.stack(list(cache.values())))
    print(f"Reused {len(rows) - len(missing):,} cached embeddings")
    return np.stack([cache[r["id"]] for r in rows])


def run() -> None:
    rows = db.query("SELECT * FROM reviews WHERE enriched_by IS NOT NULL ORDER BY id")
    if not rows:
        print("No enriched reviews to index. Run enrich first.")
        return
    vectors = _cached_vectors(rows)

    # Metadata enables filtered search (e.g. only negative Enterprise feedback). Pinecone rejects nulls.
    meta = [
        {
            "theme": r["theme"] or "",
            "sentiment": r["sentiment"] or "",
            "severity": r["severity"] or "",
            "segment": r["segment"],
            "star": int(r["star"]),
            "app": r["app"],
        }
        for r in rows
    ]
    store = get_store()
    store.upsert([r["id"] for r in rows], vectors, meta)
    print(f"Upserted into {store.name} store (total vectors: {store.count():,})")


if __name__ == "__main__":
    run()

"""Vector store: Pinecone when PINECONE_API_KEY is set, otherwise a local numpy index (for offline dev)."""
from functools import lru_cache

import numpy as np

from . import config


class PineconeStore:
    name = "pinecone"

    def __init__(self) -> None:
        from pinecone import Pinecone, ServerlessSpec

        self.pc = Pinecone(api_key=config.PINECONE_API_KEY)
        if not self.pc.has_index(config.PINECONE_INDEX):
            self.pc.create_index(
                name=config.PINECONE_INDEX,
                dimension=config.EMBED_DIM,
                metric="cosine",
                spec=ServerlessSpec(cloud=config.PINECONE_CLOUD, region=config.PINECONE_REGION),
            )
        self.index = self.pc.Index(config.PINECONE_INDEX)

    def upsert(self, ids: list[str], vectors: np.ndarray, metadata: list[dict], batch: int = 100) -> None:
        for i in range(0, len(ids), batch):
            self.index.upsert(
                vectors=[
                    {"id": ids[j], "values": vectors[j].tolist(), "metadata": metadata[j]}
                    for j in range(i, min(i + batch, len(ids)))
                ]
            )

    def search(self, vector: np.ndarray, top_k: int, filters: dict | None = None) -> list[tuple[str, float]]:
        res = self.index.query(vector=vector.tolist(), top_k=top_k, filter=filters or None)
        return [(m.id, float(m.score)) for m in res.matches]

    def count(self) -> int:
        return int(self.index.describe_index_stats().total_vector_count)


class LocalStore:
    """Brute-force cosine search over a saved matrix. 5k x 384 floats is ~7 MB, so this is instant."""

    name = "local"

    def __init__(self) -> None:
        self.ids: list[str] = []
        self.vectors = np.zeros((0, config.EMBED_DIM), dtype=np.float32)
        self.meta: list[dict] = []
        if config.LOCAL_VECTORS_PATH.exists():
            with np.load(config.LOCAL_VECTORS_PATH, allow_pickle=True) as data:  # release the file (Windows locks)
                self.ids = list(data["ids"])
                self.vectors = data["vectors"]
                self.meta = list(data["meta"])

    def upsert(self, ids: list[str], vectors: np.ndarray, metadata: list[dict], batch: int = 100) -> None:
        existing = {id_: i for i, id_ in enumerate(self.ids)}
        new_rows = []
        for j, (id_, meta) in enumerate(zip(ids, metadata)):
            if id_ in existing:
                self.vectors[existing[id_]] = vectors[j]
                self.meta[existing[id_]] = meta
            else:
                new_rows.append(j)
                self.ids.append(id_)
                self.meta.append(meta)
        if new_rows:
            self.vectors = np.vstack([self.vectors, vectors[new_rows]])
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        np.savez(
            config.LOCAL_VECTORS_PATH,
            ids=np.array(self.ids, dtype=object),
            vectors=self.vectors,
            meta=np.array(self.meta, dtype=object),
        )

    def search(self, vector: np.ndarray, top_k: int, filters: dict | None = None) -> list[tuple[str, float]]:
        if not self.ids:
            return []
        norms = np.linalg.norm(self.vectors, axis=1) * (np.linalg.norm(vector) or 1.0)
        scores = self.vectors @ vector / np.where(norms == 0, 1.0, norms)
        if filters:
            mask = np.array([all(m.get(k) == v for k, v in filters.items()) for m in self.meta])
            scores = np.where(mask, scores, -np.inf)
        order = np.argsort(-scores)[:top_k]
        return [(self.ids[i], float(scores[i])) for i in order if np.isfinite(scores[i])]

    def count(self) -> int:
        return len(self.ids)


@lru_cache(maxsize=1)
def get_store():
    return PineconeStore() if config.PINECONE_API_KEY else LocalStore()

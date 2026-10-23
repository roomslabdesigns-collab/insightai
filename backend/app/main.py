"""InsightAI API.  Run:  uvicorn app.main:app --reload --port 8000"""
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analytics, config, db, llm, rag, retrieval
from .vectorstore import get_store

app = FastAPI(title="InsightAI", version="1.0.0", description="RAG-based product feedback intelligence")
app.add_middleware(
    CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"]
)
db.init_db()


@app.on_event("startup")
def warm_up() -> None:
    """Load the embedding + rerank models in the background so the first question isn't slow."""
    def _load() -> None:
        try:
            from . import embeddings

            embeddings.embed_query("warm up")
            if config.USE_RERANKER:
                embeddings.rerank("warm up", ["warm up"])
        except Exception as exc:  # model download failed; first query will retry
            print(f"Model warm-up failed: {exc}")

    threading.Thread(target=_load, daemon=True).start()


class QueryIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    filters: dict[str, str] | None = None


@app.get("/api/health")
def health() -> dict:
    counts = db.query("SELECT COALESCE(enriched_by, 'pending') AS by, COUNT(*) AS n FROM reviews GROUP BY 1")
    store = get_store()
    return {
        "status": "ok",
        "reviews": {c["by"]: c["n"] for c in counts},
        "vector_store": {"backend": store.name, "vectors": store.count()},
        "llm": {"base_url": config.LLM_BASE_URL, "model": config.LLM_MODEL, "reachable": llm.is_available()},
        "embedding_model": config.EMBED_MODEL,
        "reranker": config.RERANK_MODEL if config.USE_RERANKER else None,
        "themes": config.THEMES,
        "segments": config.SEGMENTS,
    }


@app.get("/api/overview")
def overview() -> dict:
    return analytics.overview()


@app.get("/api/opportunities")
def opportunities() -> list[dict]:
    return analytics.opportunities()


@app.get("/api/segments")
def segments() -> list[dict]:
    return analytics.segments()


@app.get("/api/feedback")
def feedback(q: str = "", sentiment: str = "", severity: str = "", theme: str = "", segment: str = "",
             page: int = 1, page_size: int = 25) -> dict:
    return analytics.feedback(q, sentiment, severity, theme, segment, page, page_size)


@app.post("/api/query")
def query(body: QueryIn) -> dict:
    if get_store().count() == 0:
        raise HTTPException(503, "No data indexed yet. Run: python -m pipeline.run")
    return rag.answer(body.question.strip(), body.filters)


@app.post("/api/reload")
def reload() -> dict:
    """Clear caches after re-running the pipeline while the server is up."""
    analytics.reset_cache()
    retrieval.reset_cache()
    get_store.cache_clear()
    return {"status": "reloaded"}

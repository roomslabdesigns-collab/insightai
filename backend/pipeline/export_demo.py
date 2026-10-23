"""Publish the 5k test reviews as the web app's demo dataset.

1. Writes frontend/public/demo/app-reviews.json (rows already LLM-labelled by the pipeline)
2. Embeds them with Pinecone's hosted model and upserts them into the web app's index under a fixed
   namespace, so "Load demo" in the app is instant and uses no LLM quota.

    python -m pipeline.export_demo
"""
import json
import os
import time

from pinecone import Pinecone

from app import config, db

INDEX = os.getenv("WEB_PINECONE_INDEX", "insightai-feedback")  # the Next.js app's index (1024-dim)
NAMESPACE = "demo-app-reviews"
OUT = config.BACKEND_DIR.parent / "frontend" / "public" / "demo" / "app-reviews.json"
BATCH = 90


def to_row(r: dict) -> dict:
    """Same shape as the web app's Row type."""
    row = {
        "id": r["id"],
        "text": r["text"],
        "date": r["date"],
        "rating": r["star"],
        "customer": r["customer_id"],
        "segment": r["segment"],
        "revenue": r["arr"],
        "source": r["app"].split(".")[-1].capitalize(),
        "sentiment": r["sentiment"],
        "theme": r["theme"],
        "severity": r["severity"],
        "feedback_type": r["feedback_type"],
        "churn_risk": bool(r["churn_risk"]),
        "summary": r["summary"],
    }
    return {k: v for k, v in row.items() if v is not None and v != ""}


def run() -> None:
    rows = [to_row(r) for r in db.query("SELECT * FROM reviews WHERE enriched_by IS NOT NULL ORDER BY id")]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    themes = [{"name": t, "description": ""} for t in config.THEMES]
    OUT.write_text(json.dumps({"themes": themes, "rows": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(rows):,} rows -> {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")

    pc = Pinecone(api_key=config.PINECONE_API_KEY)
    index = pc.Index(INDEX)
    started = time.time()
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        for attempt in range(5):
            try:
                emb = pc.inference.embed(model="llama-text-embed-v2", inputs=[r["text"][:1000] for r in batch],
                                         parameters={"input_type": "passage", "truncate": "END"})
                break
            except Exception as exc:  # free-tier rate limit on embeddings: back off and retry
                print(f"  embed retry ({exc.__class__.__name__}); waiting {10 * (attempt + 1)}s")
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("Embedding kept failing")
        vectors = [
            {"id": r["id"], "values": e["values"], "metadata": {k: v for k, v in r.items() if k != "id"}}
            for r, e in zip(batch, emb.data)
        ]
        index.upsert(vectors=vectors, namespace=NAMESPACE)
        if (i // BATCH) % 10 == 0:
            print(f"  {i + len(batch):,}/{len(rows):,} indexed  {time.time() - started:.0f}s")
    print(f"Done: namespace '{NAMESPACE}' in index '{INDEX}'")


if __name__ == "__main__":
    run()

"""Retrieval evaluation: compare dense-only vs hybrid vs hybrid + rerank on a labelled question set.

A retrieved review counts as relevant when its enriched theme matches the question's expected theme.
Metrics: Hit@k (at least one relevant result), Precision@k, MRR (rank of first relevant result).

    python -m eval.eval_retrieval
"""
import json
import time
from pathlib import Path

from app.retrieval import retrieve

K = 8
MODES = ["dense", "hybrid", "hybrid_rerank"]


def evaluate(mode: str, questions: list[dict]) -> dict:
    hits, precision, rr, latency = 0, 0.0, 0.0, 0.0
    for item in questions:
        t0 = time.perf_counter()
        results, _ = retrieve(item["q"], top_k=K, mode=mode)
        latency += time.perf_counter() - t0
        relevant = [r["theme"] == item["theme"] for r in results]
        hits += any(relevant)
        precision += sum(relevant) / K
        rr += next((1 / (i + 1) for i, ok in enumerate(relevant) if ok), 0.0)
    n = len(questions)
    return {
        "mode": mode,
        f"hit@{K}": round(hits / n, 3),
        f"precision@{K}": round(precision / n, 3),
        "mrr": round(rr / n, 3),
        "avg_latency_ms": round(latency / n * 1000),
    }


if __name__ == "__main__":
    here = Path(__file__).parent
    questions = json.loads((here / "questions.json").read_text())
    retrieve("warm up models", mode="hybrid_rerank")
    rows = [evaluate(m, questions) for m in MODES]
    print(f"{len(questions)} questions, k={K}\n")
    print(f"{'mode':<15}{'hit@k':>8}{'prec@k':>9}{'mrr':>8}{'ms':>7}")
    for r in rows:
        print(f"{r['mode']:<15}{r[f'hit@{K}']:>8}{r[f'precision@{K}']:>9}{r['mrr']:>8}{r['avg_latency_ms']:>7}")
    (here / "results.json").write_text(json.dumps(rows, indent=2))
    print(f"\nSaved {here / 'results.json'}")

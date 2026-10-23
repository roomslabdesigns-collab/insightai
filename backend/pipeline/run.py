"""Run the whole pipeline: ingest -> enrich -> index.

    python -m pipeline.run                 # auto: LLM if reachable, else rules
    python -m pipeline.run --mode llm      # require the LLM
"""
import argparse
import time

from app import db
from pipeline import enrich, index, ingest

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["auto", "llm", "heuristic"], default="auto")
    ap.add_argument("--skip-ingest", action="store_true", help="keep existing rows and labels")
    args = ap.parse_args()

    t0 = time.time()
    db.init_db()
    if not args.skip_ingest:
        ingest.run()
    enrich.run(args.mode)
    index.run()
    print(f"Pipeline finished in {time.time() - t0:.0f}s")

"""Step 2: label every review with sentiment, theme, severity, type, churn risk and a short summary.

Reviews are sent to the LLM in batches of ENRICH_BATCH_SIZE (20) so 5k reviews need ~250 calls.
Progress is saved after every batch, so the step can be stopped and resumed.
"""
import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import config, db, heuristics, llm

SYSTEM_PROMPT = f"""You label user reviews of Android apps for a product team.
For EACH review return:
- sentiment: one of {config.SENTIMENTS}
- theme: exactly one of {config.THEMES}
- severity: one of {config.SEVERITIES}. high = crash, data loss, app unusable, or user threatens to leave;
  medium = clear defect or strong frustration; low = minor, cosmetic, or praise
- type: one of {config.FEEDBACK_TYPES}
- churn_risk: true only if the user says they will uninstall, switch to another app, or stop using it
- summary: at most 12 words describing the core issue or praise
Respond with JSON only, no prose: {{"items": [{{"id": "...", "sentiment": "...", "theme": "...",
"severity": "...", "type": "...", "churn_risk": false, "summary": "..."}}]}}"""

CONCURRENCY = int(os.getenv("LLM_CONCURRENCY", "3"))


def _validate(item: dict, row: dict) -> dict:
    """Keep valid LLM fields; fill anything missing or off-list from the rule-based labeller."""
    fallback = heuristics.label(row["text"], row["star"])

    def pick(key: str, allowed: list[str], src_key: str | None = None) -> str:
        value = str(item.get(src_key or key, "")).strip()
        match = next((a for a in allowed if a.lower() == value.lower()), None)
        return match or fallback[key]

    churn = item.get("churn_risk")
    return {
        "sentiment": pick("sentiment", config.SENTIMENTS),
        "theme": pick("theme", config.THEMES),
        "severity": pick("severity", config.SEVERITIES),
        "feedback_type": pick("feedback_type", config.FEEDBACK_TYPES, "type"),
        "summary": (str(item.get("summary") or "").strip() or fallback["summary"])[:120],
        "churn_risk": bool(churn) if isinstance(churn, bool) else fallback["churn_risk"],
    }


def _save(labels: dict[str, dict], source: str) -> None:
    with db.connect() as conn:
        conn.executemany(
            "UPDATE reviews SET sentiment=?, theme=?, severity=?, feedback_type=?, summary=?, churn_risk=?, "
            "enriched_by=? WHERE id=?",
            [
                (l["sentiment"], l["theme"], l["severity"], l["feedback_type"], l["summary"],
                 int(l["churn_risk"]), source, id_)
                for id_, l in labels.items()
            ],
        )


def _llm_batch(rows: list[dict]) -> tuple[dict[str, dict], dict]:
    payload = [{"id": r["id"], "stars": r["star"], "text": r["text"][:600]} for r in rows]
    data, usage = llm.chat_json(SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False))
    by_id = {str(i.get("id")): i for i in data.get("items", []) if isinstance(i, dict)}
    return {r["id"]: _validate(by_id.get(r["id"], {}), r) for r in rows}, usage


def run(mode: str = "auto", limit: int | None = None, redo_heuristic: bool = False, redo_all: bool = False,
        tag: str = "llm") -> None:
    if redo_all:  # re-label every review not yet labelled under `tag` (resumable)
        where = f"enriched_by IS NULL OR enriched_by != '{tag}'"
    else:
        where = "enriched_by IS NULL" + (" OR enriched_by = 'heuristic'" if redo_heuristic else "")
    rows = db.query(f"SELECT id, text, star FROM reviews WHERE {where} ORDER BY id")
    if limit:
        rows = rows[:limit]
    if not rows:
        print("Nothing to enrich.")
        return

    if mode == "auto":
        mode = "llm" if llm.is_available() else "heuristic"
        print(f"LLM at {config.LLM_BASE_URL} {'reachable' if mode == 'llm' else 'NOT reachable'} -> mode={mode}")

    if mode == "heuristic":
        _save({r["id"]: heuristics.label(r["text"], r["star"]) for r in rows}, "heuristic")
        print(f"Labelled {len(rows):,} reviews with rules.")
        return

    batches = [rows[i:i + config.ENRICH_BATCH_SIZE] for i in range(0, len(rows), config.ENRICH_BATCH_SIZE)]
    started, done, tokens, failed = time.time(), 0, 0, 0
    print(f"Enriching {len(rows):,} reviews in {len(batches)} batches (concurrency {CONCURRENCY})...")
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = {pool.submit(_llm_batch, b): b for b in batches}
        for fut in as_completed(futures):
            batch = futures[fut]
            try:
                labels, usage = fut.result()
                _save(labels, tag)
                tokens += (usage.get("prompt_tokens") or 0) + (usage.get("completion_tokens") or 0)
            except Exception as exc:
                failed += 1
                print(f"  batch {batch[0]['id']} failed ({exc}); leaving for next run")
            done += 1
            if done % 10 == 0 or done == len(batches):
                print(f"  {done}/{len(batches)} batches  {time.time() - started:.0f}s  ~{tokens:,} tokens")
    print(f"Done. {failed} failed batches. Re-run to retry them.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["auto", "llm", "heuristic"], default="auto")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--redo-heuristic", action="store_true", help="re-label rule-based rows with the LLM")
    ap.add_argument("--redo-all", action="store_true", help="re-label every row (resumable via --tag)")
    ap.add_argument("--tag", default="llm", help="value stored in enriched_by, e.g. llm-gemini")
    args = ap.parse_args()
    db.init_db()
    run(args.mode, args.limit, args.redo_heuristic, args.redo_all, args.tag)

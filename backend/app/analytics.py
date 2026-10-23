"""Aggregations behind the Dashboard, Opportunities, Decision Matrix and Segments screens."""
from functools import lru_cache

import pandas as pd

from . import config, db

TREND_DAYS = 365  # reviews are spread over several years, so compare year over year
NON_ISSUE_THEMES = {"General Feedback"}  # praise and vague comments: not actionable


@lru_cache(maxsize=1)
def frame() -> pd.DataFrame:
    df = pd.DataFrame(db.query("SELECT * FROM reviews WHERE enriched_by IS NOT NULL"))
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


def reset_cache() -> None:
    frame.cache_clear()


def _windows(df: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    end = df["date"].max()
    recent = df["date"] > end - pd.Timedelta(days=TREND_DAYS)
    prior = (df["date"] <= end - pd.Timedelta(days=TREND_DAYS)) & (df["date"] > end - pd.Timedelta(days=2 * TREND_DAYS))
    return recent, prior


def _pct_change(recent: int, prior: int) -> float | None:
    return round((recent - prior) / prior * 100, 1) if prior else None


def _arr(rows: pd.DataFrame) -> float:
    """ARR of the distinct accounts in rows (each account counted once)."""
    return float(rows.drop_duplicates("customer_id")["arr"].sum())


def overview() -> dict:
    df = frame()
    if df.empty:
        return {"empty": True}
    recent, prior = _windows(df)
    neg = df[df["sentiment"] == "negative"]
    churn = df[df["churn_risk"] == 1]
    issues = neg[~neg["theme"].isin(NON_ISSUE_THEMES)]

    themes = []
    for theme, rows in issues.groupby("theme"):
        themes.append({
            "theme": theme,
            "signals": len(rows),
            "impact": _arr(rows),
            "high_severity": int((rows["severity"] == "high").sum()),
        })
    themes.sort(key=lambda t: -t["impact"])

    # Drop a trailing partial month (data ends early in a month) so the chart doesn't show a fake dip
    end = df["date"].max()
    full = df[df["date"] < end.replace(day=1)] if end.day < 20 else df
    monthly = full.set_index("date").groupby([pd.Grouper(freq="MS"), "sentiment"]).size().unstack(fill_value=0)
    monthly = monthly.reindex(columns=config.SENTIMENTS, fill_value=0).tail(12)
    timeline = [
        {"month": idx.strftime("%b %y"), **{s: int(row[s]) for s in config.SENTIMENTS}, "total": int(row.sum())}
        for idx, row in monthly.iterrows()
    ]

    return {
        "kpis": {
            "signals": len(df),
            "signals_change": _pct_change(int(recent.sum()), int(prior.sum())),
            "churn_signals": len(churn),
            "negative_share": round(len(neg) / len(df) * 100, 1),
            "arr_at_risk": _arr(churn),
            "accounts_at_risk": int(churn["customer_id"].nunique()),
            "active_themes": sum(t["signals"] >= 0.01 * len(df) for t in themes),
            "apps": int(df["app"].nunique()),
        },
        "themes": themes,
        "timeline": timeline,
        "sentiment_split": {s: int((df["sentiment"] == s).sum()) for s in config.SENTIMENTS},
        "date_range": [df["date"].min().strftime("%Y-%m-%d"), df["date"].max().strftime("%Y-%m-%d")],
    }


def opportunities() -> list[dict]:
    df = frame()
    if df.empty:
        return []
    recent, prior = _windows(df)
    neg = df[(df["sentiment"] == "negative") & ~df["theme"].isin(NON_ISSUE_THEMES)]
    rows_by_theme = list(neg.groupby("theme"))
    if not rows_by_theme:
        return []
    max_ev = max(len(r) for _, r in rows_by_theme)
    max_arr = max(_arr(r) for _, r in rows_by_theme) or 1

    out = []
    for theme, rows in rows_by_theme:
        evidence, arr = len(rows), _arr(rows)
        high_share = float((rows["severity"] == "high").mean())
        trend = _pct_change(int(recent[rows.index].sum()), int(prior[rows.index].sum()))
        score = 100 * (
            0.35 * evidence / max_ev
            + 0.35 * arr / max_arr
            + 0.15 * high_share
            + 0.15 * min(max(trend or 0, 0), 100) / 100
        )
        accounts = int(rows["customer_id"].nunique())
        churn = int(rows["churn_risk"].sum())
        top = rows.assign(sev=rows["severity"].map({"high": 0, "medium": 1, "low": 2})).sort_values(
            ["sev", "date"], ascending=[True, False]
        ).head(3)
        out.append({
            "theme": theme,
            "score": round(score, 1),
            "priority": "P0" if score >= 75 else "P1" if score >= 55 else "P2" if score >= 35 else "P3",
            "confidence": "high" if evidence >= 40 else "medium" if evidence >= 15 else "low",
            "arr_at_risk": arr,
            "accounts": accounts,
            "evidence": evidence,
            "high_severity_share": round(high_share * 100, 1),
            "churn_mentions": churn,
            "trend": trend,
            "description": f"{accounts} accounts report recurring {theme.lower()} problems; "
                           f"{churn} reviews mention leaving the product.",
            "top_evidence": [{"id": r.id, "text": r.text, "severity": r.severity, "star": r.star} for r in top.itertuples()],
        })
    return sorted(out, key=lambda o: -o["score"])


def segments() -> list[dict]:
    df = frame()
    out = []
    for seg in config.SEGMENTS:
        rows = df[df["segment"] == seg] if not df.empty else df
        if rows.empty:
            continue
        neg = rows[(rows["sentiment"] == "negative") & ~rows["theme"].isin(NON_ISSUE_THEMES)]
        pos, negc = (rows["sentiment"] == "positive").sum(), (rows["sentiment"] == "negative").sum()
        out.append({
            "segment": seg,
            "arr": _arr(rows),
            "accounts": int(rows["customer_id"].nunique()),
            "sentiment_score": round((pos - negc) / len(rows) * 100, 1),
            "churn_risk": int(rows["churn_risk"].sum()),
            "feedback": len(rows),
            "top_problems": [{"theme": t, "count": int(c)} for t, c in neg["theme"].value_counts().head(3).items()],
        })
    return out


def feedback(q: str = "", sentiment: str = "", severity: str = "", theme: str = "", segment: str = "",
             page: int = 1, page_size: int = 25) -> dict:
    where, params = ["enriched_by IS NOT NULL"], []
    for col, val in (("sentiment", sentiment), ("severity", severity), ("theme", theme), ("segment", segment)):
        if val:
            where.append(f"{col} = ?")
            params.append(val)
    if q:
        where.append("(text LIKE ? OR app LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    clause = " AND ".join(where)
    total = db.query(f"SELECT COUNT(*) AS n FROM reviews WHERE {clause}", params)[0]["n"]
    page_size = max(1, min(page_size, 100))
    items = db.query(
        f"SELECT * FROM reviews WHERE {clause} ORDER BY date DESC, id LIMIT ? OFFSET ?",
        params + [page_size, (max(page, 1) - 1) * page_size],
    )
    return {"total": total, "page": page, "page_size": page_size, "items": items}

"""SQLite store for reviews and their enrichment. Vectors live in Pinecone (or the local index)."""
import sqlite3
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
    id            TEXT PRIMARY KEY,
    app           TEXT NOT NULL,
    text          TEXT NOT NULL,
    date          TEXT NOT NULL,
    star          INTEGER NOT NULL,
    customer_id   TEXT NOT NULL,
    segment       TEXT NOT NULL,
    arr           REAL NOT NULL,
    source        TEXT NOT NULL,
    sentiment     TEXT,
    theme         TEXT,
    severity      TEXT,
    feedback_type TEXT,
    summary       TEXT,
    churn_risk    INTEGER DEFAULT 0,
    enriched_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_reviews_theme ON reviews(theme);
CREATE INDEX IF NOT EXISTS idx_reviews_sentiment ON reviews(sentiment);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON reviews(date);
"""


@contextmanager
def connect():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)


def query(sql: str, params: tuple | list = ()) -> list[dict]:
    with connect() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def get_reviews(ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    marks = ",".join("?" * len(ids))
    return {r["id"]: r for r in query(f"SELECT * FROM reviews WHERE id IN ({marks})", ids)}

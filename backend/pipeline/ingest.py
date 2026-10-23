"""Step 1: download the app_reviews dataset, clean it, take a 5k sample and attach synthetic account data.

The dataset has no customer/revenue fields, so each review is assigned to a synthetic customer account
(segment + ARR) with a fixed seed. This is clearly labelled as synthetic in the README.
"""
import html

import numpy as np
import pandas as pd
import requests

from app import config, db

RAW_PATH = config.DATA_DIR / "raw" / "app_reviews.parquet"
N_CUSTOMERS = 600
SEGMENT_WEIGHTS = [0.6, 0.28, 0.12]
ARR_RANGES = {"SMB": (3_000, 15_000), "Mid-Market": (20_000, 80_000), "Enterprise": (90_000, 350_000)}


def download() -> pd.DataFrame:
    if not RAW_PATH.exists():
        RAW_PATH.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading dataset -> {RAW_PATH}")
        with requests.get(config.DATASET_URL, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(RAW_PATH, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    return pd.read_parquet(RAW_PATH)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"package_name": "app", "review": "text"})
    df["text"] = df["text"].astype(str).str.replace(r"\s+", " ", regex=True).str.strip()
    df = df[df["text"].str.len().between(20, 1500)]
    df = df.drop_duplicates(subset="text")
    df["date"] = pd.to_datetime(df["date"], format="%B %d %Y", errors="coerce")
    df = df.dropna(subset=["date", "star"])
    df["star"] = df["star"].astype(int).clip(1, 5)
    return df


def synthetic_customers(rng: np.random.Generator) -> pd.DataFrame:
    segments = rng.choice(config.SEGMENTS, size=N_CUSTOMERS, p=SEGMENT_WEIGHTS)
    arr = [round(rng.uniform(*ARR_RANGES[s]), -2) for s in segments]
    return pd.DataFrame(
        {"customer_id": [f"CUST-{1000 + i}" for i in range(N_CUSTOMERS)], "segment": segments, "arr": arr}
    )


def run(sample_size: int = config.SAMPLE_SIZE) -> int:
    raw = download()
    df = clean(raw)
    print(f"Raw rows: {len(raw):,}  after cleaning: {len(df):,}")
    df = df.sample(n=min(sample_size, len(df)), random_state=config.SAMPLE_SEED).sort_values("date")
    df["text"] = df["text"].map(html.unescape)  # after sampling, so the fixed-seed sample stays the same

    rng = np.random.default_rng(config.SAMPLE_SEED)
    customers = synthetic_customers(rng)
    picks = customers.iloc[rng.integers(0, N_CUSTOMERS, size=len(df))].reset_index(drop=True)
    df = pd.concat([df.reset_index(drop=True), picks], axis=1)
    df["id"] = [f"R{i:05d}" for i in range(1, len(df) + 1)]
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    db.init_db()
    with db.connect() as conn:
        conn.execute("DELETE FROM reviews")
        conn.executemany(
            "INSERT INTO reviews (id, app, text, date, star, customer_id, segment, arr, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'App Review')",
            df[["id", "app", "text", "date", "star", "customer_id", "segment", "arr"]].itertuples(index=False),
        )
    print(f"Stored {len(df):,} reviews from {df['app'].nunique()} apps ({df['date'].min()} .. {df['date'].max()})")
    return len(df)


if __name__ == "__main__":
    run()

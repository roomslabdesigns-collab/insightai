import os
import tempfile

# Point the app at an empty temp data dir before anything imports app.config
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="insightai-test-")
os.environ["PINECONE_API_KEY"] = ""
os.environ["LLM_BASE_URL"] = "http://127.0.0.1:9/v1"  # nothing listens here -> LLM "offline"

import pytest  # noqa: E402

from app import analytics, db, heuristics  # noqa: E402

REVIEWS = [
    ("R00001", "org.app.notes", "App crashes every time I open it. Uninstalling.", "2017-03-01", 1, "CUST-1000", "Enterprise", 120000),
    ("R00002", "org.app.notes", "Force closes when syncing with the server", "2017-02-11", 2, "CUST-1001", "SMB", 5000),
    ("R00003", "org.app.music", "Great app, works perfectly on my phone", "2016-12-24", 5, "CUST-1002", "Mid-Market", 40000),
    ("R00004", "org.app.music", "Drains battery really fast, very slow", "2016-05-02", 2, "CUST-1000", "Enterprise", 120000),
    ("R00005", "org.app.maps", "Please add an option to export routes", "2016-03-15", 4, "CUST-1003", "SMB", 7000),
    ("R00006", "org.app.maps", "Crashes after the latest update", "2015-09-01", 1, "CUST-1004", "Mid-Market", 30000),
]


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    db.init_db()
    with db.connect() as conn:
        conn.execute("DELETE FROM reviews")
        for r in REVIEWS:
            lab = heuristics.label(r[2], r[4])
            conn.execute(
                "INSERT INTO reviews (id, app, text, date, star, customer_id, segment, arr, source, sentiment, theme, "
                "severity, feedback_type, summary, churn_risk, enriched_by) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'App Review', ?, ?, ?, ?, ?, ?, 'heuristic')",
                (*r, lab["sentiment"], lab["theme"], lab["severity"], lab["feedback_type"], lab["summary"], int(lab["churn_risk"])),
            )
    analytics.reset_cache()
    yield

"""Rule-based labels. Used as a fallback when the LLM is unreachable, and to back-fill bad LLM output."""
import re

THEME_KEYWORDS = {
    "Crashes & Stability": r"crash|force clos|freez|hang|stuck|not respond|keeps stopping|closes|bug",
    "Performance & Battery": r"slow|lag|battery|drain|memory|ram|cpu|heavy|fast|speed|performance",
    "Sync & Connectivity": r"sync|server|connect|network|wifi|offline|login|log in|account|download|upload|backup",
    "Compatibility & Devices": r"android \d|lollipop|marshmallow|nougat|kitkat|tablet|device|phone|samsung|nexus|root|sd ?card|version of android",
    "Updates & Regressions": r"update|new version|latest version|since the|after updat|used to|no longer|downgrade",
    "Privacy & Permissions": r"permission|privacy|track|ads|advert|spy|data collect|gps|location",
    "Feature Requests": r"please add|would be nice|wish|feature|could you add|should have|option to|support for|request|missing",
    "UI & Usability": r"\bui\b|interface|design|layout|button|menu|font|theme|dark|confus|hard to|easy to use|intuitive|setting",
}
CHURN = re.compile(
    r"uninstall|switch(ing|ed)? to|alternative|moving to|refund|deleted|delete this|waste of|useless|giv(e|ing) up|not worth",
    re.I,
)
SEVERE = re.compile(r"crash|force clos|data loss|lost (all|my)|not working|doesn'?t work|unusable|broken|won'?t (open|start)", re.I)
FEATURE = re.compile(THEME_KEYWORDS["Feature Requests"], re.I)


def sentiment_from_star(star: int) -> str:
    return "negative" if star <= 2 else "neutral" if star == 3 else "positive"


def theme_for(text: str, star: int) -> str:
    lowered = text.lower()
    for theme, pattern in THEME_KEYWORDS.items():
        if re.search(pattern, lowered):
            return theme
    return "General Feedback"


def churn_signal(text: str) -> bool:
    return bool(CHURN.search(text))


def label(text: str, star: int) -> dict:
    sentiment = sentiment_from_star(star)
    severe = bool(SEVERE.search(text))
    if star <= 2 and (severe or churn_signal(text)):
        severity = "high"
    elif star <= 3 or severe:
        severity = "medium"
    else:
        severity = "low"
    if FEATURE.search(text):
        ftype = "feature request"
    elif severe:
        ftype = "bug report"
    elif text.strip().endswith("?"):
        ftype = "question"
    else:
        ftype = "complaint" if sentiment == "negative" else "praise"
    first = re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0]
    return {
        "sentiment": sentiment,
        "theme": theme_for(text, star),
        "severity": severity,
        "feedback_type": ftype,
        "summary": first[:90],
        "churn_risk": sentiment == "negative" and churn_signal(text),
    }

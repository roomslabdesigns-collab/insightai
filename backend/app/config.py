"""Central settings, read from environment variables (and backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


DATA_DIR = Path(os.getenv("DATA_DIR", BACKEND_DIR / "data"))
DB_PATH = DATA_DIR / "insightai.db"
LOCAL_VECTORS_PATH = DATA_DIR / "vectors.npz"

# Dataset
DATASET_URL = os.getenv(
    "DATASET_URL",
    "https://huggingface.co/datasets/sealuzh/app_reviews/resolve/refs%2Fconvert%2Fparquet/default/train/0000.parquet",
)
SAMPLE_SIZE = int(os.getenv("SAMPLE_SIZE", "5000"))
SAMPLE_SEED = int(os.getenv("SAMPLE_SEED", "42"))

# LLM: any OpenAI-compatible endpoint (Groq by default; Gemini/OpenRouter also work)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-oss-120b,openai/gpt-oss-20b")
LLM_MODELS = [m.strip() for m in LLM_MODEL.split(",") if m.strip()]

# Optional backup provider, used when every primary model is rate-limited (Gemini free tier)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
GEMINI_MODELS = [m.strip() for m in os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",") if m.strip()]
LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "60"))
ENRICH_BATCH_SIZE = int(os.getenv("ENRICH_BATCH_SIZE", "20"))

# Embeddings + reranking (local, free, run on CPU via fastembed/ONNX)
EMBED_MODEL = os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
EMBED_DIM = int(os.getenv("EMBED_DIM", "384"))
RERANK_MODEL = os.getenv("RERANK_MODEL", "Xenova/ms-marco-MiniLM-L-6-v2")
USE_RERANKER = _bool("USE_RERANKER", True)

# Vector DB: Pinecone when a key is set, otherwise a local numpy index
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX = os.getenv("PINECONE_INDEX", "insightai-reviews")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")

# Retrieval
TOP_K = int(os.getenv("TOP_K", "8"))
CANDIDATES = int(os.getenv("CANDIDATES", "30"))
MIN_EVIDENCE = int(os.getenv("MIN_EVIDENCE", "3"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

THEMES = [
    "Crashes & Stability",
    "Performance & Battery",
    "UI & Usability",
    "Feature Requests",
    "Sync & Connectivity",
    "Compatibility & Devices",
    "Updates & Regressions",
    "Privacy & Permissions",
    "General Feedback",
]
SENTIMENTS = ["positive", "neutral", "negative"]
SEVERITIES = ["low", "medium", "high"]
FEEDBACK_TYPES = ["bug report", "feature request", "complaint", "praise", "question"]
SEGMENTS = ["SMB", "Mid-Market", "Enterprise"]

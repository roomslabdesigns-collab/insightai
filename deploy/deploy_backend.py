"""Upload the backend to a Hugging Face Docker Space.

Prerequisite: log in once with a Hugging Face *write* token:  hf auth login
Usage (from the repo root):  backend/.venv/Scripts/python deploy/deploy_backend.py <hf-username>/insightai-api

API keys are NOT uploaded. Add them in the Space's Settings -> Variables and secrets.
"""
import sys
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

repo_id = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
api = HfApi()
api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

api.upload_folder(
    repo_id=repo_id,
    repo_type="space",
    folder_path=BACKEND,
    allow_patterns=["app/**", "pipeline/**", "eval/**", "requirements.txt", "Dockerfile", ".dockerignore",
                    "data/insightai.db"],
    ignore_patterns=["**/__pycache__/**", ".env", ".venv/**"],
    commit_message="Deploy InsightAI API",
)
api.upload_file(repo_id=repo_id, repo_type="space", path_or_fileobj=ROOT / "deploy" / "space_README.md",
                path_in_repo="README.md", commit_message="Space card")

user, name = repo_id.split("/")
print(f"Uploaded. Space: https://huggingface.co/spaces/{repo_id}")
print(f"API URL (after build): https://{user}-{name}.hf.space".lower())

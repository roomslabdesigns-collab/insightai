# InsightAI API for Hugging Face Spaces (Docker SDK). Spaces run containers as user 1000 on port 7860.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

# Bake the embedding + rerank models into the image so a cold start doesn't download them
RUN python -c "from app import embeddings; embeddings.embed_query('warm'); embeddings.rerank('warm', ['up'])"

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]

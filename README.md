# InsightAI: RAG-Powered Product Feedback Intelligence

Upload customer feedback (reviews, support tickets, surveys, interview notes) and InsightAI turns it into
**evidence-backed product insights, prioritised opportunities and recommendations**, with a PM review step and a
decision log. Every AI answer is **cited back to the customer's own words**.

> InsightAI does not replace product managers. It flags low-evidence, conflicting, or high-impact answers for human review,
> and every recommendation needs a PM decision.

## Workflow

```mermaid
flowchart TD
  A[Customer feedback<br/>CSV / JSON / TXT upload] --> B[Data cleaning<br/>dedupe, empty, short, HTML]
  B --> C[LLM theme discovery<br/>taxonomy per dataset]
  C --> D[LLM enrichment<br/>theme, sentiment, severity,<br/>product area, churn risk]
  D --> E[Embeddings<br/>Pinecone hosted model]
  E --> F[(Vector search<br/>Pinecone namespace per upload)]
  F --> G[RAG intelligence<br/>grounded, cited answers]
  D --> H[Product insights]
  H --> I[Product opportunities]
  I --> J[Prioritisation<br/>impact + revenue + severity + evidence]
  J --> K[Product recommendation<br/>LLM, evidence-cited]
  K --> L[PM review<br/>approve / needs evidence / reject]
  L --> M[Product decision log<br/>CSV + Markdown export]
```

## Features

- **Upload any feedback file:** CSV, TSV, JSON or TXT, with automatic column detection (text, date, rating, customer, segment, revenue, source)
- **One-click demo dataset:** 5,000 real app reviews, pre-labelled and pre-indexed, so trying the app costs no AI quota
- **Data cleaning report:** empty rows, too-short items, duplicates and HTML entities handled; up to 1,000 items per upload
- **Dynamic themes:** the LLM proposes a theme taxonomy for each dataset, then labels every item against it
- **LLM enrichment:** sentiment, theme, severity, product area, feedback type, churn risk and a summary, in resumable batches
- **Vector search:** Pinecone hosted embeddings (`llama-text-embed-v2`) with a private namespace per upload, auto-deleted after 24 hours
- **RAG answers:** structured JSON answers; citations that were not actually retrieved are dropped
- **Human-review triggers:** insufficient evidence, conflicting sentiment, low confidence, weak citations, high-revenue impact
- **Prioritisation:** impact score from evidence volume, revenue at risk, severity, churn share and trend (re-weighted when a column is missing)
- **Recommendations + PM review + decisions:** evidence-cited recommendations, approve / reject / needs-evidence with notes, exportable decision log
- **Multi-provider LLM failover:** rotates across free Groq models and falls back to Gemini when Groq hits its limits
- **No API key for visitors:** keys live in server-side functions; per-visitor daily limits protect the free quotas

## Architecture

| Layer | Tech |
|---|---|
| App | Next.js 15 (React 19, TypeScript), Tailwind CSS 4, Recharts, deployed on Vercel |
| Server functions | Next.js route handlers: `/api/themes`, `/api/enrich`, `/api/index`, `/api/ask`, `/api/recommend` |
| LLM | Groq (`gpt-oss-120b`, `gpt-oss-20b`) with Gemini Flash-Lite as automatic backup |
| Embeddings + vector DB | Pinecone serverless + Pinecone Inference (`llama-text-embed-v2`, 1024 dims) |
| Client | File parsing (PapaParse), cleaning, pipeline orchestration, analytics; dataset and decisions in localStorage |
| Research pipeline | Python 3.12, FastAPI, fastembed, BM25, cross-encoder rerank, pytest (in `backend/`) |

## Run Locally

```bash
cd frontend
npm install
cp .env.example .env.local    # add GROQ_API_KEY, GEMINI_API_KEY, PINECONE_API_KEY
npm run dev                   # http://localhost:3000, then upload a file in Data Sources
```

All three keys are free: [Groq](https://console.groq.com/keys), [Gemini](https://aistudio.google.com/apikey),
[Pinecone](https://app.pinecone.io). The Pinecone index is created automatically on the first upload.

## Deploy to Vercel (free)

1. Import this repository at [vercel.com/new](https://vercel.com/new) and set **Root Directory** to `frontend`.
2. Add the environment variables from `frontend/.env.example`.
3. Deploy. Every push to `main` redeploys.

## Research Pipeline and Evaluation (`backend/`)

The Python pipeline was used to design and evaluate the retrieval approach on a test set of 5,000 real Android app
reviews ([`sealuzh/app_reviews`](https://huggingface.co/datasets/sealuzh/app_reviews), with synthetic account data).
All 5,000 were labelled by an LLM, then `python -m eval.eval_retrieval` scored 20 labelled questions (k=8):

| Mode | Hit@8 | Precision@8 | MRR |
|---|---|---|---|
| Dense only (Pinecone) | 1.00 | **0.875** | 0.975 |
| Hybrid (Pinecone + BM25, RRF) | 1.00 | 0.856 | 0.975 |
| Hybrid + cross-encoder rerank | 1.00 | 0.838 | **1.000** |

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # LLM_API_KEY (Groq), GEMINI_API_KEY, PINECONE_API_KEY
python -m pipeline.run        # ingest -> enrich -> index the test set
python -m eval.eval_retrieval # retrieval metrics
python -m pytest -q
python -m pipeline.export_demo  # publish the test set as the web app's demo (JSON + Pinecone namespace)
```

## Project Structure

```
frontend/
  src/app/            pages: chat, upload, insights, feedback, opportunities, prioritization,
                      recommendations, decisions, evidence, segments
  src/app/api/        serverless routes: themes, enrich, index, ask, recommend
  src/lib/            cleaning, pipeline, analytics, store, server clients (LLM, Pinecone)
backend/
  app/ pipeline/ eval/ tests/    Python research pipeline and evaluation
```

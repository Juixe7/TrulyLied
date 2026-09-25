# TrulyLied: Distributed Multi-Modal Factual Verification Platform

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Celery](https://img.shields.io/badge/Celery-Distributed_Chords-37814A?style=flat&logo=celery&logoColor=white)](https://docs.celeryq.dev/)
[![Redis](https://img.shields.io/badge/Redis-7.0-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
[![Qdrant](https://img.shields.io/badge/Qdrant-Vector_Search-DC2626?style=flat&logo=qdrant&logoColor=white)](https://qdrant.tech/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**TrulyLied** is an enterprise-grade, distributed factual verification engine designed for real-time claim extraction, multi-agent adversarial debate, and multi-modal truth scoring across news articles, videos, and live broadcast streams.

Built on an asynchronous microservices architecture, TrulyLied replaces naive single-prompt LLM evaluations with an auditable **4-Stage Hegelian Multi-Agent DAG**, a **Two-Stage Hybrid Search Funnel** (BM25 + Dense Vectors fused via Reciprocal Rank Fusion and reranked via FlashRank Cross-Encoder), and a **Distributed Celery Chord** parallel fan-out.

---

## ⚡ Empirical Benchmark Highlights

All metrics are empirically verified on multi-process workloads and recorded in [`benchmark_data.json`](./benchmark_data.json):

| Subsystem / Metric | Benchmark Result | Operational Impact |
| :--- | :---: | :--- |
| **Semantic Cache Lookup Latency** | **`8.30 ms`** | Sub-10ms vector resolution using FastEmbed `BAAI/bge-small-en-v1.5` |
| **Exact Match Cache Speedup** | **`1,639.8x`** | Reduces end-to-end latency from $13.61\text{ s} \rightarrow 8.30\text{ ms}$ |
| **Semantic Paraphrase Speedup** | **`1,647.7x`** | Syntactically inverted claims resolved via cosine similarity ($0.9809$ score vs. $0.93$ threshold) in $8.26\text{ ms}$ |
| **FlashRank Cross-Encoder Rerank** | **`173.22 ms`** | Deep token cross-attention achieves top candidate confidence of **`1.0000`** |
| **Distributed Rate Limiter Drop Rate** | **`0.0%` (Zero 429s)** | Distributed Redis Token Bucket (24 RPM cap) + Decorrelated Jitter |
| **Worker Storage Crash Rate** | **`0.0%` (6/6 Passed)** | 3-tier Qdrant client manager eliminates SQLite file-lock worker crashes |
| **Prometheus Live Telemetry** | **`35 Metrics Live`** | Real-time P50/P90/P99 latency histograms, cache hit ratios, and provider counts on `/metrics` |

---

## 🏗️ System Architecture

```
+---------------------------------------------------------------------------------------------------------+
|                                        TRULYLIED ARCHITECTURE                                           |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   [Next.js 14 Dashboard]  <==== WebSocket (State Sync & Replay) ====>  [Node.js Express Gateway :8080] |
|                                                                                   |                     |
|                                                                                   v                     |
|                                                                        [MongoDB] & [Redis 7.0]          |
|                                                                                   |                     |
|                                           +---------------------------------------+                     |
|                                           | Celery Task Broker & Pub/Sub Bus                            |
|                                           v                                                             |
|                          [Celery Chord Fan-Out Worker Pool]                                             |
|                                           |                                                             |
|                 +-------------------------+-------------------------+                                   |
|                 v                                                   v                                   |
|        [start_pipeline_task]                               [verify_chunk_task]                          |
|        - Dual-Path YouTube Ingest                           - Distributed Redis Token Bucket (24 RPM)   |
|        - Groq Whisper Large v3 Turbo                        - Semantic Vector Cache Check (< 10ms)      |
|        - Gemini 3.6 Flash VLM Extraction                    - Veritas 4-Stage Multi-Agent DAG           |
|                                                                     |                                   |
|                                                                     v                                   |
|                                                      [aggregate_report_task]                            |
|                                                      - Truth calibration & scoring                      |
|                                                      - Real-time Redis Pub/Sub broadcast                |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 🧠 Core Engineering Pillars

### 1. The Veritas 4-Stage Multi-Agent DAG
Single-prompt LLM verifiers suffer from inherent confirmation bias: once an LLM identifies supporting text, self-attention heads strongly favor confirming the user's premise. Veritas decomposes verification into Hegelian Dialectic stages:
- **Agent 1 (Investigative Researcher)**: Formulates dual orthogonal search queries (both affirmative and debunking) and validates source authority via a Corrective RAG (CRAG) loop.
- **Agent 2 (Evidential Verifier)**: Formulates an initial thesis strictly grounded in empirical citations.
- **Agent 3 (Red-Team Adversarial Critic)**: Audits the thesis for context clipping, outdated temporal premises, satire, and logical fallacies.
- **Agent 4 (Consensus Adjudicator)**: Synthesizes thesis and antithesis, producing a calibrated confidence score and final verdict.

### 2. Two-Stage Hybrid Search & Cross-Encoder Reranking
- **Stage 1 (High Recall Funnel)**: Combines **BM25Okapi** lexical keyword matching with FastEmbed **`BAAI/bge-small-en-v1.5`** ($384\text{d}$) dense semantic vector scoring. Candidates are merged using **Reciprocal Rank Fusion (RRF, $k=60$)**, eliminating score calibration variance between bounded cosine similarity and unbounded BM25 scores.
- **Stage 2 (High Precision Reranking)**: The top 8 RRF candidates pass through FlashRank **`ms-marco-TinyBERT-L-2-v2`** to compute joint query-document cross-attention in $< 180\text{ ms}$, achieving cross-encoder precision with bi-encoder latency.

### 3. Distributed Concurrency & Rate Limiting
- **Redis Token Bucket with Lua**: Enforces an atomic 24 RPM leaky bucket directly in Redis memory, eliminating Check-Then-Act race conditions across distributed Celery forks.
- **AWS-Style Decorrelated Jitter**: Randomizes retry intervals:
  $$\text{delay}_{i+1} = \min(\text{max\_delay}, \text{Uniform}(\text{base\_delay}, \text{delay}_i \times 3))$$
  preventing lockstep worker retry waves ("thundering herd").

### 4. 3-Tier Multi-Process Storage Resilience
- **Tier 1 (Remote Network API)**: Connects to standalone Qdrant clusters (`http://qdrant:6333`).
- **Tier 2 (Local Disk Storage)**: Embedded storage (`./qdrant_storage`) with lock backoff retry.
- **Tier 3 (In-Memory Isolation Fail-Safe)**: Under SQLite file-lock contention across concurrent Celery worker processes, the client automatically falls back to `QdrantClient(":memory:")`, guaranteeing $0\%$ worker crashes.

### 5. Multi-Modal Audio & Visual Ingestion
- **Dual-Path Audio Extraction**: `YouTubeTranscriptApi` fetches native timestamps ($< 500\text{ ms}$); if subtitles are disabled, `yt-dlp` extracts the audio stream to **Groq Whisper Large v3 Turbo** with segment-level timestamps.
- **Visual Claim Extraction**: **Google Gemini 3.6 Flash VLM** analyzes video keyframes and infographics to detect deceptive chart axes, statistical assertions, and lower-third news chyrons.

---

## 🚀 Quickstart & Installation

### Option A: One-Command Docker Compose (Recommended)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/trulylied.git
   cd trulylied
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit .env and supply your free API keys (Groq, Gemini, Serper, HuggingFace)
   ```

3. **Start All Services**:
   ```bash
   docker-compose up --build
   ```
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Node.js API Gateway**: [http://localhost:8080](http://localhost:8080)
   - **Python AI Service**: [http://localhost:8000](http://localhost:8000)
   - **Prometheus Metrics**: [http://localhost:8000/metrics](http://localhost:8000/metrics)
   - **Qdrant Vector Dashboard**: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

---

### Option B: Local Development Setup

#### 1. Start Infrastructure (MongoDB & Redis)
```bash
docker run -d -p 27017:27017 --name mongo mongo:6
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

#### 2. Start Python AI & Celery Workers
```bash
# In python-ai directory
cd python-ai
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .\.venv\Scripts\activate
pip install -r requirements.txt

# Terminal 1: Start FastAPI Service
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Start Distributed Celery Worker Pool
celery -A celery_app worker --loglevel=info -c 4
```

#### 3. Start Node.js API Gateway
```bash
# In backend directory
cd backend
npm install
npm run dev  # Starts Express server on port 8080
```

#### 4. Start Next.js Frontend
```bash
# In frontend directory
cd frontend
npm install
npm run dev  # Starts Next.js dashboard on port 3000
```

---

## 🧪 Testing & Verification

Run the comprehensive integration test suite and benchmark harness:

```bash
# Run end-to-end observability and concurrency test
python test_phase4_observability.py

# Run complete 6-experiment benchmark harness
python run_full_benchmarks.py
```

---

## 📡 API Reference & Observability

### Core Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/analyze` | Dispatches URL extraction & decomposition to Celery chord pipeline |
| `POST` | `/api/analyze-live` | Initiates live stream verification with timestamp synchronization |
| `GET` | `/api/report/:id` | Returns complete verified report, chunks, and citations |
| `GET` | `/metrics` | Prometheus exposition endpoint for scraping P50/P90/P99 latencies |
| `WS` | `/ws/report/:id` | Real-time WebSocket event stream with state snapshot replay |

---

## 📚 Deep-Dive Architecture & Analysis

For a comprehensive technical analysis, system trade-off critique, and staff-level interview defense guide, see [`Analysis.md`](./Analysis.md) and [`BENCHMARK_RESULTS.md`](./BENCHMARK_RESULTS.md).

---

## 📄 License
This project is licensed under the MIT License. See [`LICENSE`](./LICENSE) for details.

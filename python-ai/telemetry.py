"""
TrulyLied Distributed Observability & Telemetry Engine
Provides:
1. Prometheus Metrics (Cache ratios, P50/P95/P99 latency histograms, LLM inference provider counters)
2. OpenTelemetry Distributed Tracing (Hierarchical parent-child spans across verification DAG)
"""

import time
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

# ── Prometheus Metrics ──

CLAIM_VERIFICATION_LATENCY = Histogram(
    "trulylied_claim_verification_latency_seconds",
    "Time taken to verify an individual factual claim across search, reranking, and debate",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 3.5, 5.0, 10.0, 20.0]
)

RETRIEVAL_LATENCY = Histogram(
    "trulylied_retrieval_latency_seconds",
    "Time taken for hybrid search (BM25 + Dense + RRF + Cross-Encoder)",
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0]
)

CACHE_HITS = Counter(
    "trulylied_semantic_cache_hits_total",
    "Total number of semantic vector cache hits"
)

CACHE_MISSES = Counter(
    "trulylied_semantic_cache_misses_total",
    "Total number of semantic vector cache misses"
)

LLM_INFERENCE_COUNT = Counter(
    "trulylied_llm_inference_total",
    "Total number of LLM inference invocations by provider and model",
    ["provider", "model"]
)

DEGRADED_CHUNKS_COUNT = Counter(
    "trulylied_degraded_chunks_total",
    "Total number of claim chunks that fell back to degraded state due to upstream errors"
)

ACTIVE_PIPELINE_RUNS = Gauge(
    "trulylied_active_pipeline_runs",
    "Number of currently active pipeline analyses"
)

# ── OpenTelemetry Distributed Tracing ──
try:
    trace.set_tracer_provider(TracerProvider())
    tracer = trace.get_tracer("trulylied-engine", "2.0.0")
except Exception as e:
    print(f"[telemetry] OTel init failed ({e}), using default tracer")
    tracer = trace.get_tracer("trulylied-engine")

def get_metrics_payload():
    """Scraped by FastAPI GET /metrics endpoint."""
    return generate_latest(), CONTENT_TYPE_LATEST

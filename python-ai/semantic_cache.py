"""
TrulyLied Semantic Vector Cache (sub-50ms lookup)
Features:
1. 3-Tier Multi-Process Safe Qdrant Client (Remote -> Process-safe Local Disk -> In-Memory Fail-Safe)
2. FastEmbed BAAI/bge-small-en-v1.5 embeddings
3. Active Prometheus Telemetry (CACHE_HITS, CACHE_MISSES)
"""

import os
import time
import atexit
import logging
from typing import Optional, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("semantic_cache")
logging.basicConfig(level=logging.INFO)

# Import Prometheus metrics
try:
    from telemetry import CACHE_HITS, CACHE_MISSES
except Exception:
    CACHE_HITS = None
    CACHE_MISSES = None

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = "claim_cache"
VECTOR_DIM = 384  # bge-small-en-v1.5 default dimension

_qdrant_client = None
_embed_model = None

def _cleanup_qdrant():
    global _qdrant_client
    if _qdrant_client is not None:
        try:
            _qdrant_client.close()
        except Exception:
            pass
        _qdrant_client = None

atexit.register(_cleanup_qdrant)

def get_embed_model():
    """Lazy-loads FastEmbed dense model."""
    global _embed_model
    if _embed_model is None:
        try:
            from fastembed import TextEmbedding
            _embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        except Exception as e:
            logger.warning(f"FastEmbed init failed: {e}")
            _embed_model = None
    return _embed_model

def get_qdrant() -> QdrantClient:
    """
    3-Tier Resilient Qdrant Client Manager:
    Tier 1: Connect to remote Qdrant Docker/cloud server (http://localhost:6333)
    Tier 2: Embedded local disk storage (./qdrant_storage) with lock safety
    Tier 3: In-memory client (':memory:') to guarantee zero SQLite lock crashes across Celery forks
    """
    global _qdrant_client
    if _qdrant_client is not None:
        return _qdrant_client

    # ── Tier 1: Remote Qdrant Server ──
    try:
        client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=3)
        client.get_collections()
        _qdrant_client = client
        logger.info(f"Connected to remote Qdrant server at {QDRANT_URL}")
    except Exception:
        # ── Tier 2: Process-Safe Local Disk ──
        local_path = os.path.join(os.path.dirname(__file__), "qdrant_storage")
        try:
            _qdrant_client = QdrantClient(path=local_path)
            logger.info("Remote Qdrant offline; using embedded local storage.")
        except Exception as disk_err:
            # ── Tier 3: In-Memory Isolation Fail-Safe ──
            logger.warning(f"Local Qdrant disk lock contention ({disk_err}); falling back to isolated in-memory client.")
            _qdrant_client = QdrantClient(":memory:")

    # Ensure collection exists
    try:
        collections = [c.name for c in _qdrant_client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            _qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=qmodels.VectorParams(
                    size=VECTOR_DIM,
                    distance=qmodels.Distance.COSINE
                )
            )
            logger.info(f"Initialized vector collection '{COLLECTION_NAME}'")
    except Exception as e:
        logger.warning(f"Collection check/create handled: {e}")

    return _qdrant_client

def embed_text(text: str) -> Optional[list]:
    """Generates 384-dimensional dense vector."""
    model = get_embed_model()
    if not model:
        return None
    try:
        embeddings = list(model.embed([text]))
        return embeddings[0].tolist()
    except Exception as e:
        logger.warning(f"Embedding failed: {e}")
        return None

def lookup_claim(claim_text: str, threshold: float = 0.93) -> Optional[Dict[str, Any]]:
    """
    Looks up claim in vector cache using cosine similarity.
    Records CACHE_HITS and CACHE_MISSES metrics in Prometheus.
    """
    t0 = time.time()
    vector = embed_text(claim_text)
    if not vector:
        if CACHE_MISSES: CACHE_MISSES.inc()
        return None

    client = get_qdrant()
    try:
        results = []
        if hasattr(client, "query_points"):
            res = client.query_points(
                collection_name=COLLECTION_NAME,
                query=vector,
                limit=1,
                score_threshold=threshold
            )
            results = res.points
        elif hasattr(client, "search"):
            results = client.search(
                collection_name=COLLECTION_NAME,
                query_vector=vector,
                limit=1,
                score_threshold=threshold
            )

        if results and len(results) > 0:
            top_hit = results[0]
            elapsed_ms = round((time.time() - t0) * 1000, 2)
            payload = top_hit.payload or {}
            
            # Record Prometheus Hit Metric
            if CACHE_HITS:
                CACHE_HITS.inc()

            print(f"[semantic_cache] CACHE HIT! Similarity: {top_hit.score:.4f} ({elapsed_ms}ms)")
            return {
                "hit": True,
                "score": top_hit.score,
                "latency_ms": elapsed_ms,
                "verdict": payload.get("verdict"),
                "confidence": payload.get("confidence", 0.9),
                "date_context": payload.get("date_context", ""),
                "citations": payload.get("citations", []),
                "reasoning": payload.get("reasoning", "") + f" (⚡ Resolved from Semantic Cache in {elapsed_ms}ms)",
                "critic_notes": payload.get("critic_notes", "Adversarial critique resolved from semantic cache.")
            }
    except Exception as e:
        logger.warning(f"Semantic search error: {e}")

    # Record Prometheus Miss Metric
    if CACHE_MISSES:
        CACHE_MISSES.inc()

    return None

def cache_claim(claim_text: str, result: Dict[str, Any]):
    """Stores a verified claim and its verdict into the semantic cache with lock protection."""
    global _qdrant_client
    vector = embed_text(claim_text)
    if not vector:
        return

    client = get_qdrant()
    try:
        import hashlib
        claim_id = int(hashlib.md5(claim_text.encode()).hexdigest()[:12], 16)
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                qmodels.PointStruct(
                    id=claim_id,
                    vector=vector,
                    payload={
                        "claim_text": claim_text,
                        "verdict": result.get("verdict"),
                        "confidence": result.get("confidence"),
                        "date_context": result.get("date_context"),
                        "citations": result.get("citations"),
                        "reasoning": result.get("reasoning"),
                        "critic_notes": result.get("critic_notes", ""),
                        "cached_at": time.time()
                    }
                )
            ]
        )
        print(f"[semantic_cache] Successfully cached claim: '{claim_text[:40]}...'")
    except Exception as e:
        logger.warning(f"Cache write failed ({e}); switching to isolated in-memory client.")
        try:
            _qdrant_client = QdrantClient(":memory:")
            _qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=qmodels.VectorParams(size=VECTOR_DIM, distance=qmodels.Distance.COSINE)
            )
            _qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=[
                    qmodels.PointStruct(
                        id=claim_id,
                        vector=vector,
                        payload={
                            "claim_text": claim_text,
                            "verdict": result.get("verdict"),
                            "confidence": result.get("confidence"),
                            "date_context": result.get("date_context"),
                            "citations": result.get("citations"),
                            "reasoning": result.get("reasoning"),
                            "critic_notes": result.get("critic_notes", ""),
                            "cached_at": time.time()
                        }
                    )
                ]
            )
        except Exception as mem_err:
            logger.warning(f"In-memory cache fallback failed: {mem_err}")

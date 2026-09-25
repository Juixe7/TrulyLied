"""
TrulyLied Hybrid Retrieval Engine
Combines:
1. Multi-source Web Search (Google Serper API + DuckDuckGo fallback)
2. Lexical Keyword Scoring via BM25Okapi (rank_bm25)
3. Dense Semantic Vector Scoring via FastEmbed (BAAI/bge-small-en-v1.5)
4. Reciprocal Rank Fusion (RRF, k=60) for scale-invariant ranking aggregation
5. FlashRank Cross-Encoder deep cross-attention reranker (ms-marco-TinyBERT-L-2-v2)
"""

import os
import re
import json
import time
import logging
from contextlib import nullcontext
import requests
import numpy as np
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

try:
    from telemetry import RETRIEVAL_LATENCY, tracer
except Exception:
    RETRIEVAL_LATENCY = None
    tracer = None

load_dotenv()

logger = logging.getLogger("retrieval")
logging.basicConfig(level=logging.INFO)

SERPER_API_KEY = os.getenv("SERPER_API_KEY")

_ranker = None
_embedding_model = None

def get_ranker():
    """Lazy-loads FlashRank cross-encoder model."""
    global _ranker
    if _ranker is None:
        try:
            from flashrank import Ranker
            _ranker = Ranker()
            logger.info("FlashRank Cross-Encoder initialized successfully.")
        except Exception as e:
            logger.warning(f"FlashRank init failed ({e}); will use lexical/dense fallback.")
            _ranker = None
    return _ranker

def get_embedding_model():
    """Lazy-loads FastEmbed dense embedding model."""
    global _embedding_model
    if _embedding_model is None:
        try:
            from fastembed import TextEmbedding
            _embedding_model = TextEmbedding("BAAI/bge-small-en-v1.5")
            logger.info("FastEmbed BAAI/bge-small-en-v1.5 initialized successfully.")
        except Exception as e:
            logger.warning(f"FastEmbed init failed ({e}); falling back to lexical ranking.")
            _embedding_model = None
    return _embedding_model

def tokenize_text(text: str) -> List[str]:
    """Simple alphanumeric tokenizer for BM25 lexical analysis."""
    return re.findall(r'\b[a-zA-Z0-9_\-\$]+\b', text.lower())

def search_serper(query: str, num_results: int = 10) -> List[Dict[str, Any]]:
    """Execute search via Serper Google Search API."""
    if not SERPER_API_KEY or not SERPER_API_KEY.strip() or SERPER_API_KEY.startswith("your_"):
        return []
    try:
        url = "https://google.serper.dev/search"
        payload = json.dumps({"q": query, "num": num_results})
        headers = {'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json'}
        resp = requests.post(url, headers=headers, data=payload, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            results = []
            for item in data.get("organic", []):
                snippet = item.get("snippet", "")
                if snippet:
                    results.append({
                        "title": item.get("title", ""),
                        "snippet": snippet,
                        "link": item.get("link", ""),
                        "date": item.get("date", "Recent"),
                        "source": "google_serper"
                    })
            return results
    except Exception as e:
        logger.warning(f"Serper search error: {e}")
    return []

def search_duckduckgo(query: str, max_results: int = 10) -> List[Dict[str, Any]]:
    """Execute search via free DuckDuckGo Search."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            ddgs_results = ddgs.text(query, max_results=max_results)
            for r in ddgs_results:
                body = r.get("body", "")
                if body:
                    results.append({
                        "title": r.get("title", ""),
                        "snippet": body,
                        "link": r.get("href", ""),
                        "date": "Recent",
                        "source": "duckduckgo"
                    })
        return results
    except Exception as e:
        logger.warning(f"DuckDuckGo search error: {e}")
        return []

def score_bm25(query: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Computes BM25Okapi lexical relevance scores across candidate snippets.
    Assigns bm25_score and bm25_rank (1-based) to each candidate.
    """
    if not candidates:
        return candidates

    try:
        from rank_bm25 import BM25Okapi
        corpus = [tokenize_text(f"{c.get('title', '')} {c.get('snippet', '')}") for c in candidates]
        tokenized_query = tokenize_text(query)

        bm25 = BM25Okapi(corpus)
        scores = bm25.get_scores(tokenized_query)

        # Attach scores
        for c, s in zip(candidates, scores):
            c["bm25_score"] = float(s)

        # Sort descending to assign ordinal rank
        sorted_by_bm25 = sorted(candidates, key=lambda x: x.get("bm25_score", 0.0), reverse=True)
        for rank, c in enumerate(sorted_by_bm25, 1):
            c["bm25_rank"] = rank

        return sorted_by_bm25
    except Exception as e:
        logger.warning(f"BM25 scoring failed ({e}); skipping lexical ranks.")
        for rank, c in enumerate(candidates, 1):
            c["bm25_score"] = 0.0
            c["bm25_rank"] = rank
        return candidates

def score_dense(query: str, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Computes dense vector cosine similarity between query and candidate snippets using FastEmbed.
    Assigns dense_score and dense_rank (1-based) to each candidate.
    """
    if not candidates:
        return candidates

    embedder = get_embedding_model()
    if not embedder:
        for rank, c in enumerate(candidates, 1):
            c["dense_score"] = 0.0
            c["dense_rank"] = rank
        return candidates

    try:
        texts = [f"{c.get('title', '')}: {c.get('snippet', '')}" for c in candidates]
        all_texts = [query] + texts
        embeddings = list(embedder.embed(all_texts))

        query_vec = np.array(embeddings[0], dtype=np.float32)
        norm_q = np.linalg.norm(query_vec)
        if norm_q > 0:
            query_vec = query_vec / norm_q

        for i, c in enumerate(candidates):
            doc_vec = np.array(embeddings[i + 1], dtype=np.float32)
            norm_d = np.linalg.norm(doc_vec)
            if norm_d > 0:
                doc_vec = doc_vec / norm_d
            sim = float(np.dot(query_vec, doc_vec))
            c["dense_score"] = round(sim, 4)

        # Sort descending to assign ordinal rank
        sorted_by_dense = sorted(candidates, key=lambda x: x.get("dense_score", 0.0), reverse=True)
        for rank, c in enumerate(sorted_by_dense, 1):
            c["dense_rank"] = rank

        return sorted_by_dense
    except Exception as e:
        logger.warning(f"Dense vector scoring failed ({e}); skipping dense ranks.")
        for rank, c in enumerate(candidates, 1):
            c["dense_score"] = 0.0
            c["dense_rank"] = rank
        return candidates

def reciprocal_rank_fusion(candidates: List[Dict[str, Any]], k: int = 60) -> List[Dict[str, Any]]:
    """
    Computes scale-invariant Reciprocal Rank Fusion (RRF):
    RRF_Score(d) = 1 / (k + rank_bm25) + 1 / (k + rank_dense)
    """
    for c in candidates:
        r_bm25 = c.get("bm25_rank", len(candidates))
        r_dense = c.get("dense_rank", len(candidates))
        rrf = (1.0 / (k + r_bm25)) + (1.0 / (k + r_dense))
        c["rrf_score"] = round(float(rrf), 6)

    # Sort descending by fused RRF score
    fused = sorted(candidates, key=lambda x: x.get("rrf_score", 0.0), reverse=True)
    return fused

def hybrid_retrieve(query: str, blacklist_social: bool = True) -> List[Dict[str, Any]]:
    """
    Executes end-to-end hybrid retrieval:
    1. Multi-source web queries (Serper -> DuckDuckGo)
    2. BM25 Lexical Scoring
    3. Dense Vector Semantic Scoring (FastEmbed)
    4. Reciprocal Rank Fusion (RRF, k=60)
    Instruments RETRIEVAL_LATENCY and OpenTelemetry tracing.
    """
    t0 = time.time()
    with (tracer.start_as_current_span("hybrid_retrieve") if tracer else nullcontext()):
        if blacklist_social:
            blacklist = "-site:youtube.com -site:facebook.com -site:instagram.com -site:twitter.com -site:x.com -site:tiktok.com"
            search_query = f"{query} {blacklist}"
        else:
            search_query = query

        # Multi-engine search
        raw_results = search_serper(search_query, num_results=10)
        if not raw_results or len(raw_results) < 3:
            ddg_results = search_duckduckgo(search_query, max_results=10)
            # Deduplicate by link
            seen_links = {r.get("link") for r in raw_results}
            for d in ddg_results:
                if d.get("link") not in seen_links:
                    raw_results.append(d)
                    seen_links.add(d.get("link"))

        if not raw_results:
            return []

        # Apply BM25 Lexical scoring
        score_bm25(query, raw_results)

        # Apply Dense Semantic Vector scoring
        score_dense(query, raw_results)

        # Fuse ranks via Reciprocal Rank Fusion
        fused_candidates = reciprocal_rank_fusion(raw_results, k=60)

        # Record metrics
        elapsed = time.time() - t0
        if RETRIEVAL_LATENCY:
            RETRIEVAL_LATENCY.observe(elapsed)

        return fused_candidates

def rerank_evidence(query: str, candidates: List[Dict[str, Any]], top_k: int = 4) -> List[Dict[str, Any]]:
    """
    Evaluates joint cross-attention scores with FlashRank Cross-Encoder on the top RRF candidates.
    Returns the top_k highest precision evidence items.
    """
    if not candidates:
        return []

    with (tracer.start_as_current_span("cross_encoder_rerank") if tracer else nullcontext()):
        try:
            ranker = get_ranker()
            if not ranker:
                return candidates[:top_k]

            from flashrank import RerankRequest
            # Take top 8 candidates from RRF to cross-encoder
            rerank_pool = candidates[:8]
            passages = [
                {"id": i, "text": f"{c.get('title', '')}: {c.get('snippet', '')}", "meta": c}
                for i, c in enumerate(rerank_pool)
            ]
            rerank_req = RerankRequest(query=query, passages=passages)
            ranked_passages = ranker.rerank(rerank_req)

            reranked_results = []
            for p in ranked_passages[:top_k]:
                meta = p.get("meta", {})
                meta["cross_encoder_score"] = round(float(p.get("score", 0.0)), 4)
                reranked_results.append(meta)

            logger.info(f"Hybrid Reranked {len(candidates)} candidates down to {len(reranked_results)} high-precision snippets.")
            return reranked_results
        except Exception as e:
            logger.warning(f"Cross-Encoder rerank failed ({e}); returning top RRF candidates.")
            return candidates[:top_k]

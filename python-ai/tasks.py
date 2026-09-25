import os
import json
import uuid
import datetime
import re
import redis
from pymongo import MongoClient
from celery import chord
from celery_app import celery_app
from rate_limiter import groq_rate_limiter, search_rate_limiter
from dotenv import load_dotenv

try:
    from telemetry import DEGRADED_CHUNKS_COUNT
except Exception:
    DEGRADED_CHUNKS_COUNT = None

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/trulylied")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Redis connection singleton for Pub/Sub and caching
_redis_client = None
def get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(REDIS_URL, decode_responses=False)
    return _redis_client

# MongoDB connection singleton
_mongo_client = None
def get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, maxPoolSize=10)
    db_name = "trulylied"
    if "/" in MONGO_URI.replace("://", ""):
        extracted = MONGO_URI.split("/")[-1].split("?")[0]
        if extracted:
            db_name = extracted
    return _mongo_client[db_name]

def publish_ws_event(report_id: str, data: dict):
    """
    Publish event to Redis channel for real-time WebSocket listeners
    AND append to a Redis list buffer (TTL 1 hour) for connection replay.
    """
    try:
        r = get_redis_client()
        payload = json.dumps(data)
        # 1. Ephemeral broadcast for active WebSocket listeners
        r.publish(f"channel:report:{report_id}", payload)
        # 2. Replay log buffer for late-joining or reconnecting clients (TTL 1 hour)
        r.rpush(f"events:report:{report_id}", payload)
        r.expire(f"events:report:{report_id}", 3600)
    except Exception as e:
        print(f"[tasks] Redis publish failed for {report_id}: {e}")

# Domain reputation dictionary
DOMAIN_REPUTATION = {
    "reuters.com": 1.0, "apnews.com": 1.0, "bbc.com": 1.0, "bbc.co.uk": 1.0,
    "nature.com": 1.0, "science.org": 1.0, "who.int": 1.0, "cdc.gov": 1.0,
    "nih.gov": 1.0, "nasa.gov": 1.0, "wikipedia.org": 0.9, "nytimes.com": 0.9,
    "theguardian.com": 0.9, "washingtonpost.com": 0.9, "economist.com": 0.9,
    "ft.com": 0.9, "bloomberg.com": 0.9, "politifact.com": 0.95, "snopes.com": 0.95,
    "factcheck.org": 0.95, "cnn.com": 0.65, "foxnews.com": 0.55, "nbcnews.com": 0.70,
    "cbsnews.com": 0.70, "abcnews.go.com": 0.70, "usatoday.com": 0.65, "npr.org": 0.80,
    "pbs.org": 0.80, "vice.com": 0.55, "buzzfeed.com": 0.55, "theonion.com": 0.05,
    "babylonbee.com": 0.05, "infowars.com": 0.10, "breitbart.com": 0.20, "dailywire.com": 0.25
}

def score_domain(domain: str):
    clean = domain.lower().replace("www.", "")
    score = DOMAIN_REPUTATION.get(clean, 0.5)
    tier = "high" if score >= 0.85 else ("medium" if score >= 0.45 else "low")
    return score, tier

@celery_app.task(bind=True, max_retries=2)
def start_pipeline_task(self, report_id: str, url: str):
    """Phase 1 & 2: Ingest, Extract, and Decompose claims into a parallel Celery Chord."""
    from main import (
        extract_content, ExtractRequest,
        decompose_claims, DecomposeRequest
    )
    db = get_db()
    
    # ── Phase 1: Extract ──
    try:
        extracted = extract_content(ExtractRequest(url=url))
        db.reports.update_one(
            {"report_id": report_id},
            {"$set": {
                "status": "extracted",
                "raw_text": extracted.text,
                "content_type": extracted.content_type,
                "domain": extracted.domain,
                "title": extracted.title
            }}
        )
        publish_ws_event(report_id, {"status": "extracted"})
    except Exception as e:
        print(f"[tasks] Extraction failed for {report_id}: {e}")
        db.reports.update_one({"report_id": report_id}, {"$set": {"status": "failed", "error_msg": str(e)}})
        publish_ws_event(report_id, {"status": "error", "error": str(e)})
        return

    # ── Phase 2: Decompose ──
    try:
        decomposed = decompose_claims(DecomposeRequest(text=extracted.text))
        chunks = []
        segments = getattr(extracted, "segments", []) or []

        def find_timestamp_for_claim(claim_text: str):
            if not segments:
                return 0.0, 0.0
            claim_words = set(re.findall(r'\b\w+\b', claim_text.lower()))
            best_match = None
            best_overlap = 0
            for seg in segments:
                text_val = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
                seg_words = set(re.findall(r'\b\w+\b', text_val.lower()))
                overlap = len(claim_words.intersection(seg_words))
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_match = seg
            if best_match and best_overlap >= 2:
                start = float(best_match.get("start", 0.0) if isinstance(best_match, dict) else getattr(best_match, "start", 0.0))
                dur = float(best_match.get("duration", 4.0) if isinstance(best_match, dict) else getattr(best_match, "duration", 4.0))
                return round(start, 2), round(start + dur, 2)
            return 0.0, 0.0

        for text in (decomposed.factual_claims or []):
            st, et = find_timestamp_for_claim(text)
            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "report_id": report_id,
                "text": text,
                "type": "factual_claim",
                "verdict": "",
                "confidence": 0.0,
                "citations": [],
                "reasoning": "",
                "critic_notes": "",
                "start_time": st,
                "end_time": et
            })
        for text in (decomposed.opinions or []):
            st, et = find_timestamp_for_claim(text)
            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "report_id": report_id,
                "text": text,
                "type": "opinion",
                "sentiment": "NEUTRAL",
                "confidence": 0.0,
                "start_time": st,
                "end_time": et
            })
        for text in (decomposed.toxic_passages or []):
            st, et = find_timestamp_for_claim(text)
            chunks.append({
                "chunk_id": str(uuid.uuid4()),
                "report_id": report_id,
                "text": text,
                "type": "toxic_passage",
                "verdict": "",
                "toxicity_score": 0.0,
                "start_time": st,
                "end_time": et
            })

        if chunks:
            db.chunks.insert_many(chunks)

        db.reports.update_one({"report_id": report_id}, {"$set": {"status": "decomposed"}})
        publish_ws_event(report_id, {"status": "decomposed"})

        # Broadcast chunk_pending events so frontend Live player renders timeline ticks immediately!
        for c in chunks:
            publish_ws_event(report_id, {
                "status": "chunk_pending",
                "chunk": {
                    "chunk_id": c["chunk_id"],
                    "report_id": report_id,
                    "text": c["text"],
                    "type": c["type"],
                    "verdict": "PENDING",
                    "confidence": 0.0,
                    "start_time": c.get("start_time", 0.0),
                    "end_time": c.get("end_time", 0.0)
                },
                "total_chunks": len(chunks)
            })

        # ── Phase 3 & 4: Celery Chord Fan-Out ──
        db.reports.update_one({"report_id": report_id}, {"$set": {"status": "processing"}})
        publish_ws_event(report_id, {"status": "processing"})

        if not chunks:
            aggregate_report_task.delay([], report_id, extracted.domain, extracted.author)
            return

        total_chunks = len(chunks)
        tasks = [verify_chunk_task.s(c, report_id, total_chunks) for c in chunks]
        callback = aggregate_report_task.s(report_id, extracted.domain, extracted.author, extracted.text[:1000])
        callback.link_error(on_chord_error.s(report_id))
        chord(tasks)(callback)

    except Exception as e:
        print(f"[tasks] Decomposition failed for {report_id}: {e}")
        db.reports.update_one({"report_id": report_id}, {"$set": {"status": "failed", "error_msg": str(e)}})
        publish_ws_event(report_id, {"status": "error", "error": str(e)})

@celery_app.task(bind=True, max_retries=2)
def verify_chunk_task(self, chunk: dict, report_id: str, total_chunks: int):
    """Phase 3 & 4: Process a single chunk (Factual Claim, Opinion, or Toxicity) with rate limiting and fault tolerance."""
    from main import (
        factcheck_claim, FactCheckRequest,
        analyze_sentiment, SentimentRequest,
        analyze_toxicity, ToxicityRequest
    )
    db = get_db()
    c_type = chunk.get("type")
    c_text = chunk.get("text", "")
    c_id = chunk.get("chunk_id", str(uuid.uuid4()))

    try:
        if c_type == "factual_claim":
            # Protect Groq API quota (30 RPM) via distributed Redis Token Bucket
            groq_rate_limiter.acquire(1, timeout=60.0)
            res = factcheck_claim(FactCheckRequest(claim=c_text, fast_mode=False))
            chunk["verdict"] = res.verdict
            chunk["confidence"] = res.confidence
            chunk["date_context"] = res.date_context
            chunk["citations"] = res.citations
            chunk["reasoning"] = res.reasoning
            chunk["critic_notes"] = getattr(res, "critic_notes", "") or ""
            chunk["is_cached"] = getattr(res, "is_cached", False)
            chunk["status"] = "completed"
        elif c_type == "opinion":
            res = analyze_sentiment(SentimentRequest(text=c_text))
            chunk["sentiment"] = res.label
            chunk["confidence"] = res.score
            chunk["status"] = "completed"
        elif c_type == "toxic_passage":
            res = analyze_toxicity(ToxicityRequest(text=c_text))
            chunk["toxicity_score"] = res.score
            chunk["verdict"] = "TOXIC" if res.is_toxic else "CLEAN"
            chunk["status"] = "completed"
    except Exception as e:
        print(f"[tasks] Error verifying chunk {c_id}: {e}")
        if DEGRADED_CHUNKS_COUNT:
            DEGRADED_CHUNKS_COUNT.inc()
        chunk["status"] = "degraded"
        chunk["error_message"] = str(e)
        if c_type == "factual_claim":
            chunk["verdict"] = "UNVERIFIABLE"
            chunk["confidence"] = 0.0
            chunk["reasoning"] = f"Verification degraded due to processing error: {str(e)}"
            chunk["critic_notes"] = "Critic evaluation bypassed due to upstream error."
            chunk["citations"] = []
        elif c_type == "opinion":
            chunk["sentiment"] = "NEUTRAL"
            chunk["confidence"] = 0.0
        elif c_type == "toxic_passage":
            chunk["toxicity_score"] = 0.0
            chunk["verdict"] = "CLEAN"

    # Safe persistence into MongoDB
    try:
        db.chunks.update_one({"chunk_id": c_id}, {"$set": chunk}, upsert=True)
    except Exception as db_err:
        print(f"[tasks] MongoDB write error for chunk {c_id}: {db_err}")

    # Safe query for completed chunks count
    completed = 0
    try:
        completed = db.chunks.count_documents({
            "report_id": report_id,
            "$or": [
                {"verdict": {"$ne": ""}},
                {"sentiment": {"$exists": True}}
            ]
        })
    except Exception as count_err:
        print(f"[tasks] MongoDB count error for report {report_id}: {count_err}")

    # Broadcast via Redis Pub/Sub & Replay Buffer
    publish_ws_event(report_id, {
        "status": "chunk_done",
        "chunk": chunk,
        "completed_chunks": completed,
        "total_chunks": total_chunks
    })

    return chunk

@celery_app.task(bind=True)
def aggregate_report_task(self, chunk_results: list, report_id: str, domain: str, author: str = "", article_text: str = ""):
    """Phase 5 & 6: Compute Author Bias, Domain Score, Composite Credibility, and Finalize."""
    from main import analyze_author_bias, AuthorBiasRequest
    db = get_db()

    try:
        # Source credibility
        domain_score, domain_tier = score_domain(domain)

        # Author bias
        author_bias_summary = ""
        try:
            if author:
                groq_rate_limiter.acquire(1, timeout=30.0)
                bias_res = analyze_author_bias(AuthorBiasRequest(author=author, article_text=article_text))
                author_bias_summary = getattr(bias_res, "bias_summary", "")
        except Exception as e:
            print(f"[tasks] Author bias error: {e}")

        # Aggregation
        true_count = 0
        total_factual = 0
        total_toxicity = 0.0
        toxic_chunk_count = 0
        has_degraded = False

        chunks = list(db.chunks.find({"report_id": report_id}))
        for c in chunks:
            if c.get("status") == "degraded":
                has_degraded = True

            if c.get("type") == "factual_claim":
                total_factual += 1
                if c.get("verdict") == "TRUE":
                    true_count += 1
            elif c.get("type") == "toxic_passage":
                toxic_chunk_count += 1
                total_toxicity += float(c.get("toxicity_score") or 0.0)

        fact_accuracy_pct = (true_count / total_factual) if total_factual > 0 else 0.5
        avg_toxicity = (total_toxicity / toxic_chunk_count) if toxic_chunk_count > 0 else 0.0
        speech_quality_score = max(0.0, 1.0 - avg_toxicity)

        credibility_score = round(
            (fact_accuracy_pct * 0.60 + speech_quality_score * 0.30 + domain_score * 0.10) * 100,
            1
        )

        final_status = "completed_with_warnings" if has_degraded else "done"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        db.reports.update_one(
            {"report_id": report_id},
            {"$set": {
                "status": final_status,
                "completed_at": now_iso,
                "credibility_score": credibility_score,
                "fact_accuracy_pct": fact_accuracy_pct,
                "speech_quality_score": speech_quality_score,
                "source_credibility": domain_tier,
                "author_bias": author_bias_summary
            }}
        )

        publish_ws_event(report_id, {
            "status": "report_done",
            "report_id": report_id,
            "final_status": final_status,
            "credibility_score": credibility_score
        })
        print(f"[tasks] Report {report_id} finalized with score: {credibility_score} (status: {final_status})")
        return {"report_id": report_id, "credibility_score": credibility_score, "status": final_status}

    except Exception as e:
        print(f"[tasks] Fatal aggregation error for report {report_id}: {e}")
        try:
            db.reports.update_one(
                {"report_id": report_id},
                {"$set": {"status": "failed", "error_msg": f"Aggregation error: {str(e)}"}}
            )
            publish_ws_event(report_id, {"status": "error", "error": str(e)})
        except Exception:
            pass
        return {"report_id": report_id, "error": str(e)}

@celery_app.task
def on_chord_error(request, exc, traceback, report_id: str):
    """
    Emergency chord error handler (link_error).
    Ensures that if worker processes crash or fail ungracefully, the report is never stranded in 'processing'.
    """
    print(f"[tasks] Chord error triggered for report {report_id}: {exc}")
    try:
        db = get_db()
        report = db.reports.find_one({"report_id": report_id})
        if report and report.get("status") in ["processing", "decomposed"]:
            db.reports.update_one(
                {"report_id": report_id},
                {"$set": {
                    "status": "completed_with_warnings",
                    "error_msg": f"Partial pipeline interruption: {str(exc)}"
                }}
            )
            publish_ws_event(report_id, {
                "status": "report_done",
                "report_id": report_id,
                "warning": "Completed with warnings due to worker failure"
            })
    except Exception as e:
        print(f"[tasks] Failed in on_chord_error handler: {e}")

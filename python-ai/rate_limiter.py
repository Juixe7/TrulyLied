"""
Distributed Rate Limiter Module
Implements Redis-backed Token Bucket using atomic Lua scripts and Decorrelated Jitter backoff.
Protects external LLM quotas (e.g., Groq 30 RPM limit) and search engines (DuckDuckGo/Serper)
across horizontally scaled Celery worker pools.
"""

import os
import time
import random
import logging
import redis
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("rate_limiter")
logging.basicConfig(level=logging.INFO)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Atomic Lua Script for Token Bucket
# KEYS[1]: bucket key (e.g., "ratelimit:groq_api")
# ARGV[1]: max_capacity (number of tokens)
# ARGV[2]: refill_rate_per_sec (tokens added per second)
# ARGV[3]: current_timestamp (float)
# ARGV[4]: requested_tokens (integer)
# Returns: [allowed: 1 or 0, remaining_tokens: float, wait_time_sec: float]
TOKEN_BUCKET_LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call("HMGET", key, "tokens", "last_updated")
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens then
    tokens = capacity
    last_updated = now
else
    local delta = math.max(0, now - last_updated)
    tokens = math.min(capacity, tokens + (delta * refill_rate))
    last_updated = now
end

if tokens >= requested then
    tokens = tokens - requested
    redis.call("HMSET", key, "tokens", tokens, "last_updated", last_updated)
    redis.call("EXPIRE", key, 120)
    return {1, tokens, 0}
else
    local needed = requested - tokens
    local wait_time = needed / refill_rate
    redis.call("HMSET", key, "tokens", tokens, "last_updated", last_updated)
    redis.call("EXPIRE", key, 120)
    return {0, tokens, wait_time}
end
"""

class RedisTokenBucket:
    """
    Distributed Token Bucket rate limiter using atomic Redis Lua scripts.
    Guarantees strict global rate limits across multiple concurrent Celery workers.
    """
    def __init__(self, key: str, capacity: int, refill_rate_per_sec: float, redis_client: Optional[redis.Redis] = None):
        self.key = f"ratelimit:{key}"
        self.capacity = capacity
        self.refill_rate = refill_rate_per_sec
        self.redis = redis_client

        if self.redis is None:
            try:
                self.redis = redis.from_url(REDIS_URL, decode_responses=True)
            except Exception as e:
                logger.warning(f"Could not connect to Redis for rate limiting ({e}); falling back to in-memory safety.")
                self.redis = None

        # Fallback local in-memory state if Redis is offline
        self._local_tokens = float(capacity)
        self._local_last_updated = time.time()

    def _eval_lua(self, requested: int):
        now = time.time()
        if self.redis:
            try:
                res = self.redis.eval(TOKEN_BUCKET_LUA, 1, self.key, self.capacity, self.refill_rate, now, requested)
                return bool(res[0]), float(res[1]), float(res[2])
            except Exception as e:
                logger.warning(f"Redis rate limiter Lua error ({e}), falling back to local memory.")
        
        # Local fallback
        delta = max(0.0, now - self._local_last_updated)
        self._local_tokens = min(float(self.capacity), self._local_tokens + (delta * self.refill_rate))
        self._local_last_updated = now

        if self._local_tokens >= requested:
            self._local_tokens -= requested
            return True, self._local_tokens, 0.0
        else:
            wait_time = (requested - self._local_tokens) / self.refill_rate
            return False, self._local_tokens, wait_time

    def acquire(self, tokens: int = 1, timeout: float = 60.0) -> bool:
        """
        Block until requested tokens are available or until timeout expires.
        Returns True if acquired, False if timed out.
        """
        start_time = time.time()

        while True:
            allowed, remaining, wait_time = self._eval_lua(tokens)
            if allowed:
                return True

            elapsed = time.time() - start_time
            if elapsed >= timeout:
                logger.error(f"Rate limit timeout ({timeout}s) exceeded for {self.key}.")
                return False

            # Calculate sleep duration with jitter
            target_sleep = min(wait_time, timeout - elapsed)
            jitter = target_sleep * random.uniform(0.0, 0.2)
            actual_sleep = max(0.1, target_sleep + jitter)

            time.sleep(actual_sleep)

def decorrelated_jitter_backoff(attempt: int, base_delay: float = 0.5, max_delay: float = 10.0, prev_delay: float = 0.5) -> float:
    """
    AWS-style Decorrelated Jitter algorithm:
    sleep = min(max_delay, random.uniform(base_delay, prev_delay * 3))
    Prevents lockstep retry waves across concurrent worker nodes.
    """
    new_delay = min(max_delay, random.uniform(base_delay, prev_delay * 3.0))
    time.sleep(new_delay)
    return new_delay

# Pre-configured global buckets
# 1. Groq LLM API: 30 RPM limit -> Configure capacity of 24 tokens, refill 24/60 = 0.40 tokens/sec
groq_rate_limiter = RedisTokenBucket(
    key="groq_llm",
    capacity=24,
    refill_rate_per_sec=0.40
)

# 2. Search Engine Scraping (DuckDuckGo / Serper): Capacity 12, refill 0.5 tokens/sec
search_rate_limiter = RedisTokenBucket(
    key="web_search",
    capacity=12,
    refill_rate_per_sec=0.50
)

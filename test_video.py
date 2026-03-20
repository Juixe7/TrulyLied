#!/usr/bin/env python3
import urllib.request, json

BASE = "http://127.0.0.1:8000"

print("=== Testing YOUR video: o9JvO7MGQPo ===")
req = urllib.request.Request(
    BASE + "/extract",
    data=json.dumps({"url": "https://www.youtube.com/watch?v=o9JvO7MGQPo"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    r = urllib.request.urlopen(req, timeout=120)
    data = json.loads(r.read().decode())
    print("Status: SUCCESS")
    print("content_type:", data.get("content_type"))
    print("title:", data.get("title"))
    print("text length:", len(data.get("text", "")))
    print("text preview:", data.get("text", "")[:200])
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP ERROR {e.code}: {body[:500]}")
except Exception as e:
    print(f"ERROR: {e}")

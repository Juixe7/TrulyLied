#!/usr/bin/env python3
import urllib.request, json

BASE = "http://127.0.0.1:8000"

print("=== Testing YouTube transcript via Data API v3 ===")
req = urllib.request.Request(
    BASE + "/extract",
    data=json.dumps({"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    r = urllib.request.urlopen(req, timeout=30)
    data = json.loads(r.read().decode())
    print("content_type:", data.get("content_type"))
    print("title:", data.get("title"))
    print("text preview:", data.get("text", "")[:300])
    print("\n=== SUCCESS - YouTube transcript working! ===")
except Exception as e:
    import traceback
    print("ERROR:", e)
    traceback.print_exc()

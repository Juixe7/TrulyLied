#!/usr/bin/env python3
import urllib.request, json

BASE = "https://13-235-68-66.nip.io"

print("=== Testing full pipeline via HTTPS ===")
req = urllib.request.Request(
    BASE + "/api/analyze",
    data=json.dumps({"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)
r = urllib.request.urlopen(req, timeout=30)
data = json.loads(r.read().decode())
print("Status:", data.get("status"))
print("Report ID:", data.get("report_id"))

import time
time.sleep(8)

r2 = urllib.request.urlopen(BASE + "/api/report/" + data["report_id"], timeout=30)
report = json.loads(r2.read().decode())
status = report.get("report", {}).get("status")
print("Report status:", status)
if status == "failed":
    print("Error:", report.get("report", {}).get("error"))
elif status:
    claims = report.get("report", {}).get("factual_claims", [])
    print(f"Claims found: {len(claims)}")
    if claims:
        print("First claim:", claims[0].get("claim", "")[:100])
    print("\n=== PIPELINE SUCCESS ===")

#!/usr/bin/env python3
import urllib.request, json, time

BASE = "https://13-235-68-66.nip.io"

# 1. Test health
print("=== Health ===")
r = urllib.request.urlopen(BASE + "/health")
print(r.read().decode())

# 2. Test analyze with a news article
print("\n=== Analyze (BBC News) ===")
req = urllib.request.Request(
    BASE + "/api/analyze",
    data=json.dumps({"url": "https://www.bbc.com/news/world"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)
r = urllib.request.urlopen(req)
data = json.loads(r.read().decode())
print(json.dumps(data, indent=2))
report_id = data.get("report_id")

# 3. Check the report
if report_id:
    print(f"\n=== Report {report_id} ===")
    time.sleep(2)
    r = urllib.request.urlopen(BASE + f"/api/report/{report_id}")
    rep = json.loads(r.read().decode())
    print("Status:", rep.get("report", {}).get("status"))

# 4. Test trends
print("\n=== Trends ===")
r = urllib.request.urlopen(BASE + "/api/trends")
t = json.loads(r.read().decode())
print(f"Recent analyses: {len(t.get('recent_analyses', []))}")
print(f"Trending domains: {len(t.get('trending_domains', []))}")

print("\n=== ALL TESTS PASSED ===")

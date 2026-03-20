#!/usr/bin/env python3
import requests, urllib.parse, re

video_id = "o9JvO7MGQPo"
instance = "https://inv.nadeko.net"
headers = {"User-Agent": "Mozilla/5.0"}

print(f"Testing {instance} for video {video_id}...")

try:
    captions_url = f"{instance}/api/v1/captions/{video_id}"
    print(f"Fetching {captions_url}")
    r = requests.get(captions_url, headers=headers, timeout=8)
    print(f"Status: {r.status_code}")
    
    if r.status_code == 200:
        captions_data = r.json()
        caption_list = captions_data.get("captions", [])
        print(f"Found {len(caption_list)} captions")
        
        chosen_label = None
        for cap in caption_list:
            if cap.get("language_code") == "en":
                chosen_label = cap.get("label")
                break
        if not chosen_label and caption_list:
            chosen_label = caption_list[0].get("label")
            
        print(f"Chosen label: {chosen_label}")
        
        if chosen_label:
            dl_url = f"{instance}/api/v1/captions/{video_id}?label={urllib.parse.quote(chosen_label)}"
            print(f"Downloading from {dl_url}")
            r2 = requests.get(dl_url, headers=headers, timeout=10)
            print(f"Download status: {r2.status_code}")
            print(f"Text length: {len(r2.text)}")
            if len(r2.text) < 100:
                print(f"Text preview: {r2.text}")
            else:
                print(f"Text preview: {r2.text[:100]}...")
except Exception as e:
    print(f"Error: {e}")

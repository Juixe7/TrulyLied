#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup
import random

def get_free_proxies():
    url = 'https://free-proxy-list.net/'
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')
    proxies = []
    # Find the table rows
    for row in soup.find('table', attrs={'class': 'table table-striped table-bordered'}).find_all('tr')[1:]:
        tds = row.find_all('td')
        try:
            ip = tds[0].text.strip()
            port = tds[1].text.strip()
            https = tds[6].text.strip()
            if https == 'yes':
                proxies.append(f"http://{ip}:{port}")
        except IndexError:
            continue
    return proxies

proxies = get_free_proxies()
print(f"Found {len(proxies)} proxies.")
if not proxies:
    exit(1)

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig
import urllib3
urllib3.disable_warnings()

video_id = "o9JvO7MGQPo"

for proxy in random.sample(proxies, min(10, len(proxies))):
    print(f"Trying proxy: {proxy}")
    try:
        ytt_api = YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(
                http_url=proxy,
                https_url=proxy,
            )
        )
        transcript = ytt_api.list(video_id).find_transcript(['hi', 'en']).fetch()
        print("Success!")
        print(transcript[0])
        break
    except Exception as e:
        print(f"Failed: {str(e)[:100]}")

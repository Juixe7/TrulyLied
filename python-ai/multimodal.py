"""
TrulyLied Multi-Modal Intelligence Engine
Provides:
1. Audio Transcription Fallback via Groq Whisper Large v3 Turbo (sub-2s latency)
2. Direct YouTube Audio Stream Extraction via yt-dlp
3. Visual Misinformation & Infographic Claim Extraction via Google Gemini 3.6 Flash VLM
"""

import os
import re
import json
import uuid
import base64
import logging
import tempfile
from typing import List, Dict, Any, Optional, Union
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("multimodal")
logging.basicConfig(level=logging.INFO)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

_gemini_vision_model = None

def get_gemini_vision():
    """Lazy-loads Gemini 3.6 Flash VLM."""
    global _gemini_vision_model
    if _gemini_vision_model is None and GEMINI_API_KEY and not GEMINI_API_KEY.startswith("your_"):
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            _gemini_vision_model = genai.GenerativeModel("gemini-3.6-flash")
            logger.info("Google Gemini 3.6 Flash VLM initialized for visual claim extraction.")
        except Exception as e:
            logger.warning(f"Gemini VLM init failed: {e}")
            _gemini_vision_model = None
    return _gemini_vision_model


def extract_visual_claims_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> List[Dict[str, Any]]:
    """
    Analyzes an extracted video keyframe, slide, or poster using Gemini 3.6 Flash VLM
    to detect on-screen deceptive charts, truncated y-axes, statistical assertions, and lower-third headlines.
    """
    model = get_gemini_vision()
    if not model:
        logger.warning("Gemini VLM not available for visual claim extraction.")
        return []

    prompt = """<system_instruction>
You are an expert visual misinformation and quantitative fact-checking analyst.
Examine this image (video keyframe, infographic, slide, or screenshot).
Identify any substantive factual claims, charts, data tables, statistics, headlines, or infographics presented visually.
Pay special attention to:
- Truncated or deceptive graph axes
- Unverified numerical claims or statistical percentages
- Sensationalized breaking news banners or lower-thirds
- Juxtaposed imagery designed to mislead

Return ONLY a valid JSON array of objects with EXACTLY these keys:
"claim": clear standalone text stating the factual claim made in the visual
"visual_type": one of "bar_chart", "line_graph", "infographic", "lower_third_headline", "statistic", or "diagram"
"observed_text": exact text visible on the graphic supporting this claim

If no verifiable factual or statistical claims are present, return an empty array: []
Return ONLY valid JSON. No Markdown formatting or conversational text.
</system_instruction>"""

    try:
        part = {"mime_type": mime_type, "data": image_bytes}
        resp = model.generate_content([prompt, part])
        raw_text = resp.text.strip() if resp and resp.text else ""

        match = re.search(r'\[.*\]', raw_text, re.DOTALL)
        if match:
            claims = json.loads(match.group(0))
            logger.info(f"Extracted {len(claims)} visual claims from keyframe via Gemini VLM.")
            return claims
    except Exception as e:
        logger.warning(f"Gemini visual claim extraction failed: {e}")

    return []


def transcribe_with_groq_whisper(
    audio_source: Union[bytes, str],
    filename: str = "audio.m4a"
) -> List[Dict[str, Any]]:
    """
    Transcribes audio using Groq's high-speed Whisper Large v3 Turbo with segment-level timestamps.
    Accepts either raw bytes or an absolute file path.
    """
    if not GROQ_API_KEY:
        logger.warning("GROQ_API_KEY missing for Whisper transcription.")
        return []

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)

        # Handle file path vs bytes buffer
        if isinstance(audio_source, str) and os.path.exists(audio_source):
            with open(audio_source, "rb") as f:
                file_tuple = (os.path.basename(audio_source), f.read())
        else:
            file_tuple = (filename, audio_source)

        # Call Groq Whisper Large v3 Turbo
        try:
            transcription = client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-large-v3-turbo",
                response_format="verbose_json",
                timestamp_granularities=["segment"]
            )
        except Exception as e:
            logger.warning(f"Whisper-turbo failed ({e}), attempting whisper-large-v3...")
            transcription = client.audio.transcriptions.create(
                file=file_tuple,
                model="whisper-large-v3",
                response_format="verbose_json",
                timestamp_granularities=["segment"]
            )

        segments = []
        for s in getattr(transcription, "segments", []):
            text = s.get("text", "").strip() if isinstance(s, dict) else getattr(s, "text", "").strip()
            start = float(s.get("start", 0.0) if isinstance(s, dict) else getattr(s, "start", 0.0))
            end = float(s.get("end", 0.0) if isinstance(s, dict) else getattr(s, "end", 0.0))
            duration = max(1.0, end - start)
            if text:
                segments.append({
                    "text": text,
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "duration": round(duration, 2)
                })

        logger.info(f"Groq Whisper transcribed {len(segments)} timestamped segments.")
        return segments
    except Exception as e:
        logger.error(f"Groq Whisper transcription failed: {e}")
        return []


def extract_subtitles_yt_dlp(url_or_id: str) -> List[Dict[str, Any]]:
    """
    Direct In-Memory Subtitle Extraction via yt-dlp:
    1. Extracts metadata in sub-2s latency without downloading media (download=False).
    2. Spoofs mobile Android InnerTube client to bypass cloud datacenter IP blocks.
    3. Fetches the json3/vtt subtitle stream directly into memory via ydl.urlopen.
    4. Returns parsed segment-level [{text, start, duration}] dicts with zero temp files.
    """
    try:
        import yt_dlp
    except ImportError:
        logger.warning("yt-dlp is not installed in the environment.")
        return []

    # Standardize video ID and URL
    if url_or_id.startswith("http"):
        match = re.search(r'(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})', url_or_id)
        video_id = match.group(1) if match else url_or_id
        url = url_or_id
    else:
        video_id = url_or_id
        url = f"https://www.youtube.com/watch?v={video_id}"

    ydl_opts = {
        'skip_download': True,
        'extractor_args': {
            'youtube': {
                'player_client': ['android']
            }
        },
        'quiet': True,
        'no_warnings': True,
        'socket_timeout': 15,
    }

    segments = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"[yt-dlp-subs] Fetching metadata in-memory for: {url}")
            info = ydl.extract_info(url, download=False)
            sub_dict = info.get('subtitles', {}) or {}
            auto_dict = info.get('automatic_captions', {}) or {}

            # Priority order for language tracks: manual english, then auto english, then first available
            target_tracks = None
            for lang_key in ['en', 'en-US', 'en-GB']:
                if lang_key in sub_dict:
                    target_tracks = sub_dict[lang_key]
                    break
            if not target_tracks:
                for lang_key in ['en', 'en-US', 'en-GB']:
                    if lang_key in auto_dict:
                        target_tracks = auto_dict[lang_key]
                        break
            if not target_tracks:
                if sub_dict:
                    target_tracks = next(iter(sub_dict.values()))
                elif auto_dict:
                    target_tracks = next(iter(auto_dict.values()))

            if not target_tracks:
                logger.warning(f"[yt-dlp-subs] No subtitle or auto-caption tracks found for {video_id}.")
                return []

            # Prefer json3 for fast structured parsing, then vtt, then first available
            json3_track = next((t for t in target_tracks if t.get('ext') == 'json3'), None)
            vtt_track = next((t for t in target_tracks if t.get('ext') == 'vtt'), None)
            target = json3_track or vtt_track or target_tracks[0]
            sub_url = target.get('url')

            if not sub_url:
                logger.warning(f"[yt-dlp-subs] Target subtitle track has no URL.")
                return []

            logger.info(f"[yt-dlp-subs] Fetching subtitle stream ({target.get('ext')}) directly into memory...")
            raw_bytes = ydl.urlopen(sub_url).read()
            content = raw_bytes.decode('utf-8', errors='ignore')

            # Parse JSON3 format
            if target.get('ext') == 'json3' or 'json3' in sub_url or content.strip().startswith('{'):
                try:
                    data = json.loads(content)
                    events = data.get('events', [])
                    for ev in events:
                        start_ms = ev.get('tStartMs', 0)
                        dur_ms = ev.get('dDurationMs', 0)
                        segs = ev.get('segs', [])
                        text = "".join(s.get('utf8', '') for s in segs).strip()
                        text = text.replace('\n', ' ').replace('\xa0', ' ')
                        if text and text != ' ':
                            segments.append({
                                'text': text,
                                'start': round(start_ms / 1000.0, 2),
                                'duration': round(dur_ms / 1000.0, 2)
                            })
                except Exception as json_err:
                    logger.warning(f"[yt-dlp-subs] json3 parse error: {json_err}")

            # Fallback to VTT parser if JSON3 yielded no segments
            if not segments:
                vtt_pattern = re.compile(
                    r'(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\n(.+?)(?=\n\n|\n\d{2}:\d{2}|\Z)',
                    re.DOTALL
                )
                for match in vtt_pattern.finditer(content):
                    start_str, end_str, text = match.groups()
                    parts = start_str.split(":")
                    start = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
                    parts2 = end_str.split(":")
                    end = int(parts2[0]) * 3600 + int(parts2[1]) * 60 + float(parts2[2])
                    clean_t = re.sub(r'<[^>]+>', '', text).strip().replace('\xa0', ' ')
                    if clean_t:
                        segments.append({
                            'text': clean_t,
                            'start': round(start, 2),
                            'duration': round(end - start, 2)
                        })

            logger.info(f"[yt-dlp-subs] Successfully extracted {len(segments)} caption segments in-memory.")
            return segments

    except Exception as e:
        logger.warning(f"[yt-dlp-subs] Subtitle extraction failed: {e}")
        return []


def download_youtube_audio(url_or_id: str, max_duration_sec: int = 900) -> Optional[str]:
    """
    Uses yt-dlp to stream and download the direct audio track of a YouTube video
    to a temporary file, avoiding heavy full-video downloads.
    """
    try:
        import yt_dlp

        # Standardize URL
        if not url_or_id.startswith("http"):
            url = f"https://www.youtube.com/watch?v={url_or_id}"
        else:
            url = url_or_id

        temp_dir = tempfile.gettempdir()
        out_template = os.path.join(temp_dir, f"trulylied_{uuid.uuid4().hex[:6]}_%(id)s.%(ext)s")

        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'outtmpl': out_template,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'max_filesize': 24 * 1024 * 1024, # 24 MB safety cap to stay within Groq Whisper 25MB limit
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios']
                }
            },
            'socket_timeout': 15,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Extracting YouTube audio stream for: {url}")
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if os.path.exists(filename):
                return filename

    except Exception as e:
        logger.error(f"yt-dlp audio download failed: {e}")

    return None


def transcribe_youtube_audio_fallback(url_or_id: str) -> List[Dict[str, Any]]:
    """
    High-level fallback pipeline when YouTube subtitles/transcripts are disabled:
    1. Downloads audio track via yt-dlp.
    2. Transcribes via Groq Whisper Large v3 Turbo with timestamps.
    3. Safely cleans up temporary audio file.
    """
    audio_path = download_youtube_audio(url_or_id)
    if not audio_path:
        return []

    try:
        segments = transcribe_with_groq_whisper(audio_path)
        return segments
    finally:
        # Cleanup temp file
        if os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass

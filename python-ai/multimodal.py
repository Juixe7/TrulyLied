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
        out_template = os.path.join(temp_dir, "trulylied_%(id)s.%(ext)s")

        ydl_opts = {
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'outtmpl': out_template,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'max_filesize': 50 * 1024 * 1024, # 50 MB safety cap
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

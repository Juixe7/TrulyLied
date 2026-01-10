# TrulyLied

**Live Demo:** [https://trulylied.vercel.app](https://trulylied.vercel.app)

An automated fact-checking platform for news articles, blogs, YouTube videos, and webpages, complete with a one-click Chrome extension that generates live analysis reports from the active tab.

## Features ✨

- **Automated Fact-Checking:** Instantly verify claims from any webpage or YouTube video.
- **One-Click Chrome Extension:** Generate live analysis reports directly from your active browser tab.
- **Evidence-Backed Verdicts:** AI engine extracts claims and verifies them through live DuckDuckGo/Serper searches, providing full citations.
- **Chunk-by-Chunk Streaming:** Real-time streaming of analysis results via WebSockets.
- **Sentiment & Toxicity Detection:** Integrated RoBERTa and Toxic-BERT models for advanced text analysis.

## Tech Stack 🛠️

- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, Framer Motion
- **Backend:** Node.js, FastAPI (Python), MongoDB
- **AI/ML:** Qwen 2.5 72B, RoBERTa, Toxic-BERT
- **Infrastructure:** Docker, WebSockets, REST

## Architecture

TrulyLied is built on a Dockerized microservices architecture. A Node.js orchestrator manages the analysis pipeline and streams chunk-by-chunk results to the Next.js frontend via WebSockets, while MongoDB persists the reports. The core AI engine runs on Python/FastAPI, powering the extraction and verification workflows using Qwen 2.5 and live web searches.

## License 📄
This project is licensed under the MIT License.

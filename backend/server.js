require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const { createClient } = require('redis');
const Report = require('./models/Report');
const Chunk = require('./models/Chunk');
const { setWss, runPipeline } = require('./pipeline');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
setWss(wss);

// ── Redis Pub/Sub for Horizontally Scaled WebSockets ──
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
const redisSubscriber = createClient({ url: REDIS_URL });

redisSubscriber.connect()
  .then(() => {
    console.log('[redis] Connected to Redis Pub/Sub');
    redisSubscriber.pSubscribe('channel:report:*', (message, channel) => {
      const parts = channel.split(':');
      const reportId = parts[2];
      wss.clients.forEach((client) => {
        if (client.reportId === reportId && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
  })
  .catch((err) => {
    console.log('[redis] Redis Pub/Sub offline, falling back to local WebSockets:', err.message);
  });

wss.on('connection', async (ws, req) => {
  // Extract report id from path /ws/report/:id
  const match = req.url.match(/\/ws\/report\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const reportId = match[1];
    ws.reportId = reportId;

    // ── Snapshot & Catch-Up Handshake ──
    // Send immediate snapshot of current report & verified chunks to eliminate connection race conditions
    try {
      const report = await Report.findOne({ report_id: reportId }).lean();
      const chunks = await Chunk.find({ report_id: reportId }).lean();

      if (ws.readyState === WebSocket.OPEN) {
        const completedChunks = (chunks || []).filter(c => Boolean(c.verdict || c.sentiment)).length;
        ws.send(JSON.stringify({
          status: 'sync_state',
          report_id: reportId,
          report: report || null,
          chunks: chunks || [],
          total_chunks: chunks ? chunks.length : 0,
          completed_chunks: completedChunks
        }));
      }
    } catch (err) {
      console.error(`[ws] Failed to send sync snapshot for report ${reportId}:`, err.message);
    }
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://mongo:27017/trulylied')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

function detectContentType(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return 'blog';
}

const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

// Routes
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const reportId = uuidv4();
  const domain = new URL(url).hostname;
  
  const report = new Report({
    report_id: reportId,
    url,
    domain,
    status: 'queued',
    content_type: detectContentType(url),
    created_at: new Date().toISOString()
  });

  await report.save();
  
  // Dispatch to distributed Celery worker queue via Python AI service
  try {
    console.log(`[analyze] Dispatching ${reportId} to distributed Celery queue...`);
    await axios.post(`${PYTHON_AI_URL}/pipeline/start`, { report_id: reportId, url }, { timeout: 3000 });
  } catch (err) {
    console.log(`[analyze] Celery dispatch failed (${err.message}), falling back to in-memory pipeline...`);
    runPipeline(reportId, url);
  }

  res.status(202).json({
    report_id: reportId,
    status: 'queued',
    ws_url: `/ws/report/${reportId}`,
    report_url: `/api/report/${reportId}`,
    content_type: report.content_type
  });
});

app.post('/api/analyze-live', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'YouTube video URL is required' });
  }

  // Extract YouTube video id
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  const videoId = match ? match[1] : null;

  const reportId = uuidv4();
  const domain = 'youtube.com';

  const report = new Report({
    report_id: reportId,
    url,
    domain,
    status: 'queued',
    content_type: 'youtube',
    created_at: new Date().toISOString()
  });

  await report.save();

  // Dispatch to distributed Celery worker queue via Python AI service
  try {
    console.log(`[analyze-live] Dispatching ${reportId} (video: ${videoId}) to Celery...`);
    await axios.post(`${PYTHON_AI_URL}/pipeline/start`, { report_id: reportId, url }, { timeout: 4000 });
  } catch (err) {
    console.log(`[analyze-live] Celery dispatch failed (${err.message}), falling back to in-memory pipeline...`);
    runPipeline(reportId, url);
  }

  res.status(202).json({
    report_id: reportId,
    video_id: videoId,
    status: 'queued',
    ws_url: `/ws/report/${reportId}`,
    report_url: `/api/report/${reportId}`,
    content_type: 'youtube'
  });
});

app.get('/api/report/:id', async (req, res) => {
  const report = await Report.findOne({ report_id: req.params.id }).lean();
  if (!report) return res.status(404).json({ error: 'Report not found' });
  
  const chunks = await Chunk.find({ report_id: req.params.id }).lean();
  res.json({ report, chunks });
});

app.get('/api/reports', async (req, res) => {
  const reports = await Report.find().sort({ created_at: -1 }).limit(100).lean();
  res.json({ reports });
});

app.get('/api/trends', async (req, res) => {
  const reports = await Report.find({ status: 'done' }).lean();
  
  const domainMap = {};
  for (const r of reports) {
    if (!domainMap[r.domain]) {
      domainMap[r.domain] = { domain: r.domain, count: 0, scores: [], latest_url: r.url, latest_score: r.credibility_score };
    }
    domainMap[r.domain].count++;
    domainMap[r.domain].latest_url = r.url;
    domainMap[r.domain].latest_score = r.credibility_score;
    domainMap[r.domain].scores.push(r.credibility_score);
  }

  let stats = Object.values(domainMap).map(d => {
    const avg_score = d.scores.reduce((a, b) => a + b, 0) / d.scores.length;
    return { ...d, avg_score, scores: undefined };
  });

  stats.sort((a, b) => b.count - a.count);
  stats = stats.slice(0, 20);

  const recent = reports.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 10);

  res.json({ trending_domains: stats, recent_analyses: recent });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'trulylied-backend-node' }));

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

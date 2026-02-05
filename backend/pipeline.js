const { v4: uuidv4 } = require('uuid');
const Report = require('./models/Report');
const Chunk = require('./models/Chunk');
const api = require('./workers/api');
const { scoreDomain } = require('./workers/domain');

// WSServer is injected from server.js
let wss = null;
function setWss(serverWss) {
  wss = serverWss;
}

function pushUpdate(reportId, update) {
  if (!wss) return;
  wss.clients.forEach((client) => {
    // We attach reportId to the client on connection if they subscribed to it
    if (client.reportId === reportId && client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(JSON.stringify(update));
    }
  });
}

async function markFailed(reportId, reason) {
  await Report.updateOne({ report_id: reportId }, { status: 'failed', error_msg: reason });
  pushUpdate(reportId, { status: 'error', error: reason });
}

async function runPipeline(reportId, url) {
  console.log(`[pipeline] Starting report ${reportId} | URL: ${url}`);
  let report = await Report.findOne({ report_id: reportId });

  // Phase 1 - Extract
  let extracted;
  try {
    extracted = await api.extract(url);
    await Report.updateOne(
      { report_id: reportId },
      {
        status: 'extracted',
        raw_text: extracted.text,
        content_type: extracted.content_type,
        domain: extracted.domain,
      }
    );
    pushUpdate(reportId, { status: 'extracted' });
  } catch (err) {
    console.error(`[pipeline] Phase 1 failed for ${reportId}:`, err.message);
    return markFailed(reportId, 'Content extraction failed: ' + err.message);
  }

  // Phase 2 - Decompose
  let decomposed;
  let chunks = [];
  try {
    decomposed = await api.decomposeClaims(extracted.text);
    const buildChunk = (text, type) => ({
      chunk_id: uuidv4(),
      report_id: reportId,
      text,
      type
    });
    const claimChunks = (decomposed.factual_claims || []).map(t => buildChunk(t, 'factual_claim'));
    const opinionChunks = (decomposed.opinions || []).map(t => buildChunk(t, 'opinion'));
    const toxicChunks = (decomposed.toxic_passages || []).map(t => buildChunk(t, 'toxic_passage'));
    
    chunks = [...claimChunks, ...opinionChunks, ...toxicChunks];
    
    if (chunks.length > 0) {
      await Chunk.insertMany(chunks);
    }
    await Report.updateOne({ report_id: reportId }, { status: 'decomposed' });
    pushUpdate(reportId, { status: 'decomposed' });
  } catch (err) {
    console.error(`[pipeline] Phase 2 failed for ${reportId}:`, err.message);
    return markFailed(reportId, 'Claim decomposition failed: ' + err.message);
  }

  // Phase 3 & 4 - Concurrent processing with concurrency limit
  await Report.updateOne({ report_id: reportId }, { status: 'processing' });
  let completed = 0;
  const totalChunks = chunks.length;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Delay to prevent HF API rate limits (2s)
    await new Promise(r => setTimeout(r, 2000));

    try {
      if (chunk.type === 'factual_claim') {
        const result = await api.factCheck(chunk.text, false);
        chunk.verdict = result.verdict;
        chunk.confidence = result.confidence;
        chunk.date_context = result.date_context;
        chunk.citations = result.citations;
        chunk.reasoning = result.reasoning;
      } else if (chunk.type === 'opinion') {
        const result = await api.analyzeSentiment(chunk.text);
        chunk.sentiment = result.label;
        chunk.confidence = result.score;
      } else if (chunk.type === 'toxic_passage') {
        const result = await api.analyzeToxicity(chunk.text);
        chunk.toxicity_score = result.score;
        chunk.verdict = result.is_toxic ? 'TOXIC' : 'CLEAN';
      }
    } catch (err) {
      console.error(`[pipeline] Worker failed for chunk ${chunk.chunk_id}:`, err.message);
      if (chunk.type === 'factual_claim') chunk.verdict = 'ERROR';
      if (chunk.type === 'opinion') chunk.sentiment = 'NEUTRAL';
      if (chunk.type === 'toxic_passage') chunk.toxicity_score = 0;
    }

    // Save enriched chunk
    await Chunk.updateOne({ chunk_id: chunk.chunk_id }, chunk);
    completed++;

    pushUpdate(reportId, {
      status: 'chunk_done',
      chunk,
      completed_chunks: completed,
      total_chunks: totalChunks
    });
  }
  
  console.log(`[pipeline] Phases 3+4 done - all chunks processed`);

  // Phase 5 - Source Credibility + Author Bias
  const { score: domainScore, tier: domainTier } = scoreDomain(extracted.domain);
  let authorBias = { bias_summary: '', political_lean: 'unknown', emotional_tone: 'neutral' };
  try {
    authorBias = await api.analyzeAuthorBias(extracted.author, extracted.text);
  } catch (err) {
    console.error('[pipeline] Author bias failed:', err.message);
  }

  // Phase 6 - Aggregation
  let trueCount = 0;
  let totalFactual = 0;
  let totalToxicity = 0;
  let toxicChunkCount = 0;

  for (const c of chunks) {
    if (c.type === 'factual_claim') {
      totalFactual++;
      if (c.verdict === 'TRUE') trueCount++;
    } else if (c.type === 'toxic_passage') {
      toxicChunkCount++;
      totalToxicity += (c.toxicity_score || 0);
    }
  }

  const factAccuracyPct = totalFactual > 0 ? trueCount / totalFactual : 0.5;
  const avgToxicity = toxicChunkCount > 0 ? totalToxicity / toxicChunkCount : 0.0;
  const speechQualityScore = 1.0 - avgToxicity;

  const credibilityScore = (factAccuracyPct * 0.60 + speechQualityScore * 0.30 + domainScore * 0.10) * 100;

  console.log(`[pipeline] Score: credibility=${credibilityScore.toFixed(1)} fact=${factAccuracyPct.toFixed(2)} speech=${speechQualityScore.toFixed(2)} source=${domainTier}`);

  await Report.updateOne(
    { report_id: reportId },
    {
      status: 'done',
      completed_at: new Date().toISOString(),
      credibility_score: credibilityScore,
      fact_accuracy_pct: factAccuracyPct,
      speech_quality_score: speechQualityScore,
      source_credibility: domainTier,
      author_bias: authorBias.bias_summary,
    }
  );

  pushUpdate(reportId, { status: 'report_done' });
  console.log(`[pipeline] Report ${reportId} completed`);
}

module.exports = {
  setWss,
  runPipeline
};

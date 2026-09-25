const { v4: uuidv4 } = require('uuid');
const Report = require('./models/Report');
const Chunk = require('./models/Chunk');
const api = require('./workers/api');
const { scoreDomain } = require('./workers/domain');
const { createClient } = require('redis');

let wss = null;
function setWss(serverWss) {
  wss = serverWss;
}

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';
const redisPublisher = createClient({ url: REDIS_URL });

redisPublisher.connect().catch((err) => {
  console.log('[redis-pub] Redis Publisher offline, using direct WebSocket broadcast:', err.message);
});

function broadcastDirect(reportId, msgString) {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.reportId === reportId && client.readyState === 1 /* WebSocket.OPEN */) {
      client.send(msgString);
    }
  });
}

function pushUpdate(reportId, update) {
  const msgString = JSON.stringify(update);
  if (redisPublisher.isOpen) {
    redisPublisher.publish(`channel:report:${reportId}`, msgString).catch(() => {
      broadcastDirect(reportId, msgString);
    });
  } else {
    broadcastDirect(reportId, msgString);
  }
}

async function markFailed(reportId, reason) {
  try {
    await Report.updateOne(
      { report_id: reportId },
      { status: 'failed', error_msg: reason, completed_at: new Date().toISOString() }
    );
  } catch (dbErr) {
    console.error(`[pipeline] Failed to update report status to failed:`, dbErr.message);
  }
  pushUpdate(reportId, { status: 'error', error: reason });
}

async function runPipeline(reportId, url, rawText = null, userTitle = null) {
  console.log(`[pipeline] Starting report ${reportId} | URL: ${url || 'direct-text'}`);

  try {
    // Phase 1 - Extract Content or Use Provided Text
    let extracted;
    if (rawText && rawText.trim().length > 0) {
      extracted = {
        title: userTitle || 'Direct Text Submission',
        author: 'User Input',
        text: rawText.trim(),
        content_type: 'text',
        domain: 'direct-input',
        segments: []
      };
      await Report.updateOne(
        { report_id: reportId },
        {
          status: 'extracted',
          title: extracted.title,
          author: extracted.author,
          raw_text: extracted.text,
          content_type: extracted.content_type,
          domain: extracted.domain,
        }
      );
      pushUpdate(reportId, {
        status: 'extracted',
        title: extracted.title,
        domain: extracted.domain,
        content_type: extracted.content_type
      });
    } else {
      try {
        extracted = await api.extract(url);
        await Report.updateOne(
          { report_id: reportId },
          {
            status: 'extracted',
            title: extracted.title || '',
            author: extracted.author || '',
            raw_text: extracted.text || '',
            content_type: extracted.content_type || 'blog',
            domain: extracted.domain || 'unknown',
          }
        );
        pushUpdate(reportId, {
          status: 'extracted',
          title: extracted.title,
          domain: extracted.domain,
          content_type: extracted.content_type
        });
      } catch (err) {
        console.error(`[pipeline] Phase 1 extract failed for ${reportId}:`, err.message);
        const isYt = url && (url.includes('youtube.com') || url.includes('youtu.be'));
        return markFailed(
          reportId,
          isYt
            ? 'Spoken dialogue or captions could not be automatically retrieved for this YouTube video. Please use the "Paste Transcript / Text" option to verify the video claims directly.'
            : 'Content extraction failed: ' + err.message
        );
      }
    }

    // Phase 2 - Decompose into Claims
    let decomposed;
    let chunks = [];
    try {
      decomposed = await api.decomposeClaims(extracted.text);
      const buildChunk = (text, type) => ({
        chunk_id: uuidv4(),
        report_id: reportId,
        text,
        type,
        status: 'pending',
        verdict: '',
        confidence: 0,
        citations: [],
        reasoning: '',
        critic_notes: '',
        is_cached: false
      });

      const claimChunks = (decomposed.factual_claims || []).map((t) => buildChunk(t, 'factual_claim'));
      const opinionChunks = (decomposed.opinions || []).map((t) => buildChunk(t, 'opinion'));
      const toxicChunks = (decomposed.toxic_passages || []).map((t) => buildChunk(t, 'toxic_passage'));

      chunks = [...claimChunks, ...opinionChunks, ...toxicChunks];

      // YouTube timestamp alignment against video segments
      if (extracted.segments && Array.isArray(extracted.segments) && extracted.segments.length > 0) {
        for (const chunk of chunks) {
          const lowerChunk = chunk.text.toLowerCase();
          const match = extracted.segments.find((seg) => {
            if (!seg.text) return false;
            const snippet = seg.text.toLowerCase().trim().slice(0, 25);
            return snippet.length >= 8 && lowerChunk.includes(snippet);
          });
          if (match) {
            chunk.start_time = match.start;
            chunk.end_time = match.end || (match.start + (match.duration || 3));
          }
        }
      }

      if (chunks.length > 0) {
        await Chunk.insertMany(chunks);
      }

      await Report.updateOne({ report_id: reportId }, { status: 'decomposed' });
      pushUpdate(reportId, { status: 'decomposed', total_chunks: chunks.length });

      // Notify clients of all pending chunks for real-time queue visibility
      for (const chunk of chunks) {
        pushUpdate(reportId, { status: 'chunk_pending', chunk });
      }
    } catch (err) {
      console.error(`[pipeline] Phase 2 decompose failed for ${reportId}:`, err.message);
      return markFailed(reportId, 'Claim decomposition failed: ' + err.message);
    }

    // Phase 3 & 4 - Verification
    await Report.updateOne({ report_id: reportId }, { status: 'processing' });
    let completed = 0;
    const totalChunks = chunks.length;

    const factualChunks = chunks.filter((c) => c.type === 'factual_claim');
    const opinionAndToxicChunks = chunks.filter((c) => c.type !== 'factual_claim');

    // 1. Process opinion and toxic chunks concurrently (fast HF models)
    if (opinionAndToxicChunks.length > 0) {
      await Promise.all(
        opinionAndToxicChunks.map(async (chunk) => {
          try {
            if (chunk.type === 'opinion') {
              const res = await api.analyzeSentiment(chunk.text);
              chunk.sentiment = res.label || 'NEUTRAL';
              chunk.confidence = res.score || 0.5;
            } else if (chunk.type === 'toxic_passage') {
              const res = await api.analyzeToxicity(chunk.text);
              chunk.toxicity_score = res.score || 0;
              chunk.verdict = res.is_toxic ? 'TOXIC' : 'CLEAN';
            }
            chunk.status = 'completed';
          } catch (err) {
            console.warn(`[pipeline] Non-factual chunk failed (${chunk.chunk_id}):`, err.message);
            chunk.status = 'degraded';
            chunk.error_message = err.message;
            if (chunk.type === 'opinion') chunk.sentiment = 'NEUTRAL';
            if (chunk.type === 'toxic_passage') {
              chunk.toxicity_score = 0;
              chunk.verdict = 'CLEAN';
            }
          }

          const { _id, __v, ...cleanChunk } = chunk;
          await Chunk.updateOne({ chunk_id: chunk.chunk_id }, { $set: cleanChunk });
          completed++;
          pushUpdate(reportId, {
            status: 'chunk_done',
            chunk: cleanChunk,
            completed_chunks: completed,
            total_chunks: totalChunks
          });
        })
      );
    }

    // 2. Process factual claims sequentially to respect Groq rate limits (300ms polite throttle)
    for (const chunk of factualChunks) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const result = await api.factCheck(chunk.text, false);
        chunk.verdict = result.verdict || 'UNVERIFIABLE';
        chunk.confidence = result.confidence || 0;
        chunk.date_context = result.date_context || '';
        chunk.citations = result.citations || [];
        chunk.reasoning = result.reasoning || '';
        chunk.critic_notes = result.critic_notes || '';
        chunk.is_cached = Boolean(result.is_cached);
        chunk.status = 'completed';
      } catch (err) {
        console.error(`[pipeline] Fact check failed for chunk (${chunk.chunk_id}):`, err.message);
        chunk.verdict = 'UNVERIFIABLE';
        chunk.confidence = 0;
        chunk.status = 'degraded';
        chunk.error_message = err.message;
        chunk.reasoning = 'Verification service was temporarily unavailable for this claim.';
      }

      const { _id, __v, ...cleanChunk } = chunk;
      await Chunk.updateOne({ chunk_id: chunk.chunk_id }, { $set: cleanChunk });
      completed++;
      pushUpdate(reportId, {
        status: 'chunk_done',
        chunk: cleanChunk,
        completed_chunks: completed,
        total_chunks: totalChunks
      });
    }

    console.log(`[pipeline] Phases 3+4 completed (${completed}/${totalChunks} chunks)`);

    // Phase 5 - Source Credibility + Author Bias
    const { score: domainScore, tier: domainTier } = scoreDomain(extracted.domain);
    let authorBias = { bias_summary: '', political_lean: 'unknown', emotional_tone: 'neutral' };
    try {
      authorBias = await api.analyzeAuthorBias(extracted.author || '', extracted.text || '');
    } catch (err) {
      console.warn('[pipeline] Author bias analysis failed:', err.message);
    }

    // Phase 6 - Composite Score Aggregation
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
    const speechQualityScore = Math.max(0, 1.0 - avgToxicity);

    const credibilityScore = Math.round(
      (factAccuracyPct * 0.60 + speechQualityScore * 0.30 + domainScore * 0.10) * 100
    );

    console.log(`[pipeline] Final Report Score: credibility=${credibilityScore} fact=${factAccuracyPct.toFixed(2)} speech=${speechQualityScore.toFixed(2)} source=${domainTier}`);

    await Report.updateOne(
      { report_id: reportId },
      {
        status: 'done',
        completed_at: new Date().toISOString(),
        credibility_score: credibilityScore,
        fact_accuracy_pct: Math.round(factAccuracyPct * 100) / 100,
        speech_quality_score: Math.round(speechQualityScore * 100) / 100,
        source_credibility: domainTier,
        author_bias: authorBias.bias_summary || 'Neutral editorial tone',
        author_bias_meta: authorBias,
      }
    );

    pushUpdate(reportId, { status: 'report_done' });
    console.log(`[pipeline] Report ${reportId} successfully finished`);
  } catch (fatalErr) {
    console.error(`[pipeline] Fatal unexpected error in report ${reportId}:`, fatalErr);
    await markFailed(reportId, `Internal pipeline error: ${fatalErr.message}`);
  }
}

module.exports = {
  setWss,
  runPipeline,
  markFailed
};


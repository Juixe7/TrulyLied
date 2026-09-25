const axios = require('axios');

const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

async function callWithRetry(endpoint, payload, timeoutMs = 30000, maxRetries = 2) {
  const url = `${PYTHON_AI_URL}${endpoint}`;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await axios.post(url, payload, { timeout: timeoutMs });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      const isRetryable = status === 429 || status === 503 || err.code === 'ECONNRESET';
      if (isRetryable && attempt < maxRetries) {
        const backoffMs = (attempt + 1) * 2000;
        console.warn(`[api-proxy] ${endpoint} returned ${status || err.code}. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw err;
    }
  }
}

async function extract(url) {
  return callWithRetry('/extract', { url }, 90000, 1);
}

async function decomposeClaims(text) {
  return callWithRetry('/decompose', { text }, 45000, 2);
}

async function factCheck(claim, fastMode = false) {
  return callWithRetry('/factcheck', { claim, fast_mode: fastMode }, 90000, 1);
}

async function analyzeSentiment(text) {
  return callWithRetry('/sentiment', { text }, 20000, 1);
}

async function analyzeToxicity(text) {
  return callWithRetry('/toxicity', { text }, 20000, 1);
}

async function analyzeAuthorBias(author, article_text) {
  return callWithRetry('/author_bias', { author, article_text }, 25000, 1);
}

module.exports = {
  extract,
  decomposeClaims,
  factCheck,
  analyzeSentiment,
  analyzeToxicity,
  analyzeAuthorBias,
};


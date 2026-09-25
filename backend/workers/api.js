const axios = require('axios');

const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

async function extract(url) {
  const res = await axios.post(`${PYTHON_AI_URL}/extract`, { url }, { timeout: 60000 });
  return res.data;
}

async function decomposeClaims(text) {
  const res = await axios.post(`${PYTHON_AI_URL}/decompose`, { text });
  return res.data;
}

async function factCheck(claim, fastMode = false) {
  const res = await axios.post(`${PYTHON_AI_URL}/factcheck`, { claim, fast_mode: fastMode });
  return res.data;
}

async function analyzeSentiment(text) {
  const res = await axios.post(`${PYTHON_AI_URL}/sentiment`, { text });
  return res.data;
}

async function analyzeToxicity(text) {
  const res = await axios.post(`${PYTHON_AI_URL}/toxicity`, { text });
  return res.data;
}

async function analyzeAuthorBias(author, article_text) {
  const res = await axios.post(`${PYTHON_AI_URL}/author_bias`, { author, article_text });
  return res.data;
}

module.exports = {
  extract,
  decomposeClaims,
  factCheck,
  analyzeSentiment,
  analyzeToxicity,
  analyzeAuthorBias,
};

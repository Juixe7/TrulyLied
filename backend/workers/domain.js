const domainReputation = {
  // ── High Credibility ──────────────
  "reuters.com": 1.0,
  "apnews.com": 1.0,
  "bbc.com": 1.0,
  "bbc.co.uk": 1.0,
  "nature.com": 1.0,
  "science.org": 1.0,
  "who.int": 1.0,
  "cdc.gov": 1.0,
  "nih.gov": 1.0,
  "nasa.gov": 1.0,
  "wikipedia.org": 0.9,
  "nytimes.com": 0.9,
  "theguardian.com": 0.9,
  "washingtonpost.com": 0.9,
  "economist.com": 0.9,
  "ft.com": 0.9,
  "bloomberg.com": 0.9,
  "politifact.com": 0.95,
  "snopes.com": 0.95,
  "factcheck.org": 0.95,

  // ── Medium Credibility ──────────────────────────────────────────────────
  "cnn.com": 0.65,
  "foxnews.com": 0.55,
  "nbcnews.com": 0.70,
  "cbsnews.com": 0.70,
  "abcnews.go.com": 0.70,
  "usatoday.com": 0.65,
  "npr.org": 0.80,
  "pbs.org": 0.80,
  "vice.com": 0.55,
  "buzzfeed.com": 0.55,

  // ── Low Credibility ─────────────
  "theonion.com": 0.05,
  "babylonbee.com": 0.05,
  "worldnewsdailyreport.com": 0.05,
  "nationalreport.net": 0.05,
  "empirenews.net": 0.05,
  "infowars.com": 0.10,
  "breitbart.com": 0.20,
  "dailywire.com": 0.25,
  "dailykos.com": 0.25,
  "example.com": 0.5,
};

function tierLabel(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function scoreDomain(domain) {
  domain = domain.toLowerCase().replace(/^www\./, '');
  if (domainReputation[domain] !== undefined) {
    const score = domainReputation[domain];
    return { score, tier: tierLabel(score) };
  }
  return { score: 0.5, tier: "medium" };
}

module.exports = { scoreDomain };

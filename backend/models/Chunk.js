const mongoose = require('mongoose');

const chunkSchema = new mongoose.Schema({
  chunk_id: { type: String, required: true, unique: true },
  report_id: { type: String, required: true, index: true },
  text: { type: String, required: true },
  type: { type: String, required: true }, // factual_claim | opinion | toxic_passage
  verdict: { type: String }, // TRUE | FALSE | MISLEADING | UNVERIFIABLE | ""
  confidence: { type: Number, default: 0 },
  date_context: { type: String },
  citations: { type: [String], default: [] },
  reasoning: { type: String, default: '' },
  critic_notes: { type: String, default: '' },
  is_cached: { type: Boolean, default: false },
  status: { type: String, default: 'pending' }, // pending | completed | degraded
  error_message: { type: String, default: '' },
  sentiment: { type: String }, // POSITIVE | NEGATIVE | NEUTRAL
  toxicity_score: { type: Number, default: 0 },
  start_time: { type: Number },
  end_time: { type: Number }
});

module.exports = mongoose.model('Chunk', chunkSchema);

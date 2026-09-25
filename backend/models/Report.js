const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  report_id: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  title: { type: String, default: '' },
  author: { type: String, default: '' },
  domain: { type: String, required: true },
  status: { type: String, required: true }, // queued | extracted | decomposed | processing | done | failed
  raw_text: { type: String },
  content_type: { type: String, required: true }, // blog | youtube
  credibility_score: { type: Number, default: 0 },
  fact_accuracy_pct: { type: Number, default: 0 },
  speech_quality_score: { type: Number, default: 0 },
  source_credibility: { type: String }, // low | medium | high
  author_bias: { type: String },
  author_bias_meta: { type: mongoose.Schema.Types.Mixed, default: null },
  created_at: { type: String, required: true },
  completed_at: { type: String },
  error_msg: { type: String }
});

reportSchema.index({ status: 1 });
reportSchema.index({ created_at: -1 });
reportSchema.index({ domain: 1 });

module.exports = mongoose.model('Report', reportSchema);

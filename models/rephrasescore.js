const mongoose = require("mongoose");

const RephraseScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User"
  },
  rephraseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Rephrase"
  },
  attemptNumber: {
    type: Number,
    required: true
  },
  semanticScore: {
    type: Number,
    required: true
  },
  structureScore: {
    type: Number,
    required: true
  },
  grammarScore: {
    type: Number,
    required: true
  },
  creativityScore: {
    type: Number,
    required: true
  },
  totalScore: {
    type: Number,
    required: true
  },
  feedback: {
    type: String
  },
  scoredAt: {
    type: Date,
    default: Date.now
  }
});

const RephraseScoreModel = mongoose.model("RephraseScore", RephraseScoreSchema);
module.exports = RephraseScoreModel;
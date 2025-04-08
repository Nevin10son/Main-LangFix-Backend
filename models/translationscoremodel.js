// models/TranslationScoreModel.js
const mongoose = require("mongoose");

const TranslationScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User"
  },
  translationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Translation" // Reference to the original translation task
  },
  attemptNumber: {
    type: Number,
    required: true,
    default: 1
  },
  userTranslation: {
    type: String,
    required: true
  },
  wordUsageScore: {
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
  completenessScore: {
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

const TranslationScoreModel = mongoose.model("TranslationScore", TranslationScoreSchema);
module.exports = TranslationScoreModel;
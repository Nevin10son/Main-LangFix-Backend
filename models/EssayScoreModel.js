// models/EssayScoreModel.js
const mongoose = require("mongoose");

const EssayScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User"
  },
  essayId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Essay" // Reference to the essay topic/prompt
  },
  attemptNumber: {
    type: Number,
    required: true,
    default: 1
  },
  essayText: {
    type: String,
    required: true
  },
  contentScore: {
    type: Number,
    required: true
  },
  organizationScore: {
    type: Number,
    required: true
  },
  languageScore: {
    type: Number,
    required: true
  },
  grammarScore: {
    type: Number,
    required: true
  },
  totalScore: {
    type: Number,
    required: true
  },
  feedback: {
    type: Object, // This will store the complete feedback object
    required: true
  },
  overallFeedback: {
    type: String
  },
  scoredAt: {
    type: Date,
    default: Date.now
  }
});

const EssayScoreModel = mongoose.model("EssayScore", EssayScoreSchema);
module.exports = EssayScoreModel;
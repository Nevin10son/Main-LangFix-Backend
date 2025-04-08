const mongoose = require('mongoose');

const StoryScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    required: true
  },
  originalStory: {
    type: String,
    required: true
  },
  completedStory: {
    type: String,
    required: true
  },
  scores: {
    narrativeFlow: {
      score: Number,
      feedback: String,
      points: [String]
    },
    creativity: {
      score: Number,
      feedback: String,
      points: [String]
    },
    structure: {
      score: Number,
      feedback: String,
      points: [String]
    },
    grammar: {
      score: Number,
      feedback: String,
      points: [String]
    },
    total: Number
  },
  overallFeedback: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  attemptNumber: {
    type: Number,
    default: 1
  }
});

// Create a compound index to ensure uniqueness of userId, storyId, and attemptNumber
StoryScoreSchema.index(
  { userId: 1, storyId: 1, attemptNumber: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('StoryScore', StoryScoreSchema);

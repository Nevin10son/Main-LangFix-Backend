// UserStorySchema.js
const mongoose = require("mongoose");

const UserStorySchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: "User" 
  },
  storyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: "Story" 
  },
  attempts: [
    {
      attemptNumber: { 
        type: Number, 
        required: true 
      },
      completedStory: { 
        type: String, 
        required: true 
      },
      submittedAt: { 
        type: Date, 
        default: Date.now 
      },
      score: {
        type: Number,
        default: null
      },
      feedback: {
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
        total: Number,
        overallFeedback: String
      },
      isScored: {
        type: Boolean,
        default: false
      }
    }
  ]
});

// Create a compound index for userId and storyId
UserStorySchema.index({ userId: 1, storyId: 1 });

const UserStoryModel = mongoose.model("UserStory", UserStorySchema);

module.exports = UserStoryModel;
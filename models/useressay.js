const mongoose = require("mongoose");

const EssaySubmissionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  }, // Reference to User
  category: { 
    type: String, 
    required: true 
  }, // Store category name
  topicId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  }, // Reference to Topic ID
  topic: { 
    type: String, 
    required: true 
  }, // Store topic question
  attempts: [
    {
      attemptNumber: { 
        type: Number, 
        required: true 
      },
      essayText: { 
        type: String, 
        required: true 
      }, // User's submitted essay
      submittedAt: { 
        type: Date, 
        default: Date.now 
      } // Timestamp of submission
    }
  ]
});

const EssaySubmission = mongoose.model("EssaySubmission", EssaySubmissionSchema);
module.exports = EssaySubmission;
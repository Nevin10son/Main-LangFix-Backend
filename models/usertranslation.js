const mongoose = require("mongoose");

const UserTranslationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Users", 
    required: true 
  },
  translationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "TranslationText", 
    required: true 
  }, // Refers to the admin-added text
  attempts: [
    {
      attemptNumber: { 
        type: Number, 
        required: true 
      },
      translatedText: { 
        type: String, 
        required: true 
      },
      submittedAt: { 
        type: Date, 
        default: Date.now 
      }
    }
  ],
  // These fields are retained for backward compatibility but will be moved to TranslationScore model
  score: { 
    type: Number, 
    default: 0 
  }, // AI-generated score
  feedback: { 
    type: String, 
    default: "" 
  } // AI suggestions
});

const UserTranslation = mongoose.model("UserTranslation", UserTranslationSchema);

module.exports = UserTranslation;
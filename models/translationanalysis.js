const mongoose = require("mongoose");

const translationAnalysisSchema = new mongoose.Schema({
  // Reference to the user who submitted the translation
  userId: {
    type: new mongoose.Schema.Types.ObjectId,
    ref: "User", // Assumes you have a User model
    required: true,
    
  },

  // Reference to the original translation (if provided via translationId)
  translationId: {
    type:  new mongoose.Schema.Types.ObjectId,
    ref: "UserTranslation", // Assumes you have a Translation model
    required: false, // Optional, as malayalamText can be provided instead
    index: true, // For efficient querying by translation
  },

  // Translation Accuracy Section
  translationAccuracy: {
    aiTranslation: {
      type: String,
      required: true,
      trim: true,
    },
    userTranslation: {
      type: String,
      required: true,
      trim: true,
    },
    result: {
      type: String,
      required: true,
      trim: true,
    },
  },

  // Grammar Analysis Section (Array of sentence analyses)
  grammar: [
    {
      original: {
        type: String,
        required: true,
        trim: true,
      },
      issues: [
        {
          type: String,
          required: true,
          trim: true,
        },
      ],
      corrected: {
        type: String,
        required: true,
        trim: true,
      },
    },
  ],

  // Vocabulary Enhancement Section (Array of sentence enhancements)
  vocabulary: [
    {
      original: {
        type: String,
        required: true,
        trim: true,
      },
      enhanced: {
        type: String,
        required: true,
        trim: true,
      },
      replaced: {
        type: String,
        required: true,
        trim: true,
      },
      meanings: {
        type: String,
        required: true,
        trim: true,
      },
    },
  ],

  // Timestamp of when the analysis was created
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true, // Prevents modification after creation
  },
});

// Create the model
const TranslationAnalysis = mongoose.model("TranslationAnalysis", translationAnalysisSchema);

module.exports = TranslationAnalysis;
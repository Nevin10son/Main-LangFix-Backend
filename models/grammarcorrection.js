const mongoose = require("mongoose");

const ErrorSentenceSchema = new mongoose.Schema({
  sentence: { type: String, required: true }, // Sentence with grammatical errors
  createdAt: { type: Date, default: Date.now },
});

const ErrorSentence = mongoose.model("ErrorSentence", ErrorSentenceSchema);

module.exports = ErrorSentence;

const mongoose = require("mongoose");

const UserCorrectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" }, // Reference to the user
  sentenceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "ErrorSentence" }, // Reference to the sentence
  correctedSentence: { type: String, required: true }, // User's corrected sentence
  submittedAt: { type: Date, default: Date.now }, // Timestamp of submission
});

const UserCorrection = mongoose.model("UserCorrection", UserCorrectionSchema);

module.exports = UserCorrection;

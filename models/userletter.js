const mongoose = require("mongoose");

const UserLetterSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" }, // Reference to the user
  letterId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "letter" }, // Reference to the specific letter task
  answer: { type: String, required: true }, // User's written letter
  submittedAt: { type: Date, default: Date.now }, // Timestamp of submission
});

const UserLetter = mongoose.model("UserLetter", UserLetterSchema);

module.exports = UserLetter;

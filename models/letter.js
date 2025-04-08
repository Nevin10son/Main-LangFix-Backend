const mongoose = require("mongoose");

const LetterSchema = new mongoose.Schema({
  category: { type: String, required: true }, // Category name (e.g., Formal, Informal, Business)
  letters: [{ description: String }], // List of letter prompts under each category
  createdAt: { type: Date, default: Date.now },
});

const Letter = mongoose.model("Letter", LetterSchema);

module.exports = Letter;

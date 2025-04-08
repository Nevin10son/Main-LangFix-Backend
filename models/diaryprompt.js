const mongoose = require("mongoose");

// ✅ Admin's Prompt Collection
const DiaryPromptSchema = new mongoose.Schema({
  question: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const DiaryPrompt = mongoose.model("DiaryPrompt", DiaryPromptSchema);
module.exports = DiaryPrompt
const mongoose = require("mongoose");

const DiarySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true }, // User reference
  date: { type: String, required: true }, // Format: YYYY-MM-DD

  // ✅ Array to store multiple prompts with their IDs and responses
  prompts: [
    {
      promptId: { type: mongoose.Schema.Types.ObjectId, ref: "DiaryPrompt", required: true }, // Reference to the prompt
      response: { type: String, default: "" }, // User's response to the prompt
    },
  ],

 
  narrative: { type: String, default: "" }, // Story of the day
});

const Diary = mongoose.model("Diary", DiarySchema);
module.exports = Diary;

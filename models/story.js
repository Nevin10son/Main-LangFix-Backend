const mongoose = require("mongoose");

const StorySchema = new mongoose.Schema({
  title: { type: String, required: true }, // Title of the story
  storyText: { type: String, required: true }, // Incomplete story
  createdAt: { type: Date, default: Date.now },
});

const storyModel = mongoose.model("Story", StorySchema);

module.exports = storyModel;

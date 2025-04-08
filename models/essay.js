  const mongoose = require("mongoose");

  const EssayCategorySchema = new mongoose.Schema({
    category: { type: String, required: true, unique: true },
    topics: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true }, // ✅ Unique ID for each topic
        question: { type: String, required: true },
      },
    ],
  });

  const EssayCategory = mongoose.model("EssayCategory", EssayCategorySchema);
  module.exports = EssayCategory;

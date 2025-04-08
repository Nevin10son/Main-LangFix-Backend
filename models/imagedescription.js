const mongoose = require("mongoose");

const imageQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true }, // Question related to the image
  imagePath: { type: String, required: true }, // Path or URL of the uploaded image
  imageDescription: { type: String, required: true }, // Admin-provided description
  createdAt: { type: Date, default: Date.now } // Timestamp
});

const ImageModel = mongoose.model("ImageQuestion", imageQuestionSchema);
module.exports = ImageModel;

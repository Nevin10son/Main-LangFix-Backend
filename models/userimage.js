const mongoose = require("mongoose");

const userResponseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  imageId: { type: mongoose.Schema.Types.ObjectId, ref: "ImageQuestion", required: true },
  description: { type: String, required: true },
  attempt: { type: Number, default: 1 },  // Added attempt field with default value of 1
  createdAt: { type: Date, default: Date.now }
});

const UserResponse = mongoose.model("UserResponse", userResponseSchema);
module.exports = UserResponse;
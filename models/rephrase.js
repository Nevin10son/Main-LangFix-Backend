const mongoose = require("mongoose");

const RephraseSchema = new mongoose.Schema({
  text: { type: String, required: true }, // The paragraph to be rephrased
  createdAt: { type: Date, default: Date.now },
});

const RephraseModel = mongoose.model("Rephrase", RephraseSchema);

module.exports = RephraseModel;

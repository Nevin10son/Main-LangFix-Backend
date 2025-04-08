const mongoose = require('mongoose')
const translateSchema = mongoose.Schema(
    {
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      });
      
const translateModel = mongoose.model("TranslationText", translateSchema);
module.exports = translateModel

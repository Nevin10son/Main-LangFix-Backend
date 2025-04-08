// UserRephraseSchema.js
const mongoose = require("mongoose");

const UserRephraseSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: "User" 
  },
  rephraseId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true, 
    ref: "Rephrase" 
  },
  attempts: [
    {
      attemptNumber: { 
        type: Number, 
        required: true 
      },
      rephrasedText: { 
        type: String, 
        required: true 
      },
      submittedAt: { 
        type: Date, 
        default: Date.now 
      }
    }
  ]
});

const UserRephraseModel = mongoose.model("UserRephrase", UserRephraseSchema);
module.exports = UserRephraseModel;
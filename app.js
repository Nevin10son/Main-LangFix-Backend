const express = require("express")
const cors = require("cors")
const mongoose  = require("mongoose")
require("dotenv").config();
const userModel = require('./models/user')
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const adminModel = require('./models/admin')
const translateModel = require('./models/texttranslation')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const ImageQuestion = require('./models/imagedescription')
const EssayCategory = require('./models/essay')
const Rephrase = require('./models/rephrase')
const Story =  require('./models/story')
const ErrorSentence = require('./models/grammarcorrection')
const Letter = require('./models/letter')
const Diary = require('./models/diary')
const UserTranslationModel = require('./models/usertranslation')
const UserImage = require('./models/userimage')
const UserRephraseModel = require('./models/userrephrase')
const UserStoryModel =  require('./models/userstory')
const UserCorrection = require('./models/usererrorcorrection')
const UserLetter = require('./models/userletter')
const { GoogleGenerativeAI } = require('@google/generative-ai');
const EssaySubmission = require('./models/useressay')
const DiaryPrompt = require('./models/diaryprompt')
const StoryScore = require('./models/StoryScoreModel')
const ChatHistory = require('./models/ChatHistory');




const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect("mongodb+srv://Nevin:nevin235235@cluster0.0rfrr.mongodb.net/language-learner?retryWrites=true&w=majority&appName=Cluster0")

const storage =  multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/")
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now()
        cb(null, uniqueSuffix + file.originalname)
    }
})

const upload = multer({storage:storage})
const GEMINI_API_KEY = ''
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function isEnglishLearningQuery(query) {
  try {
    // Use the already defined model instead of creating a new one
    const prompt = `Determine if this question is related to learning English: "${query}"
    Respond with only "YES" or "NO".`;
    
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().toUpperCase();
    
    return text === "YES";
  } catch (error) {
    console.error('Error checking query topic:', error);
    return false; // Default to false on error
  }
}

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Check if query is English-learning related
    const isEnglishRelated = await isEnglishLearningQuery(message);
    
    let response;
    if (!isEnglishRelated) {
      response = "I'm here to help with English learning questions only. Please ask about grammar, vocabulary, pronunciation, or other English language topics.";
    } else {
      // Improved prompt for better formatting
      const prompt = `You are an English language tutor. Answer the following question about English:

"${message}"

Guidelines for your response:
1. Use clear headings with ## or ### markdown format
2. Organize information in short, digestible paragraphs
3. Use bullet points (•) for lists
4. Include 3-4 practical examples in a "Examples:" section
5. If relevant, add a brief "Tips to Remember:" section
6. Keep your total response under 250 words unless a detailed explanation is needed
7. Use simple, conversational language
8. Add emoji sparingly if appropriate (📝, 🔤, 📚)
9. Format any rules or important points in **bold**
10. If explaining differences between words/concepts, use a simple comparison table with | marks

Provide helpful explanations and focus on being clear, concise, and educational.`;
      
      const result = await model.generateContent(prompt);
      response = result.response.text();
    }
    
    // Save to database
    const newChatHistory = new ChatHistory({
      userId,
      question: message,
      answer: response,
      timestamp: new Date()
    });
    
    await newChatHistory.save();
    
    res.json({ response });
    
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Get chat history for a user
app.get('/api/chat/history/:userId', async (req, res) => {
  try {
   
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const chatHistory = await ChatHistory.find({ userId })
      .sort({ timestamp: 1 }) // Sort by timestamp ascending (oldest first)
      .select('question answer timestamp');
    
    res.json(chatHistory);
    
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

app.post("/score-translation", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let { originalText, userTranslation, translationId, userId, attemptNumber = 1 } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request body
    if (!originalText || !userTranslation) {
      return res.status(400).json({
        Status: "Error",
        message: "Original text and user translation are required",
      });
    }

    if (!translationId) {
      return res.status(400).json({
        Status: "Error",
        message: "Translation ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        Status: "Error",
        message: "User ID is required",
      });
    }

    try {
      // Generate reference translation using Gemini
      const referencePrompt = `Translate this Malayalam text to English accurately and naturally:\n${originalText}`;
      const referenceResult = await model.generateContent(referencePrompt);
      const referenceTranslation = referenceResult.response.text().trim();

      // Single comprehensive evaluation prompt with explicit instructions
      const scoringPrompt = `
        Evaluate this Malayalam to English translation based on the following criteria:
        
        Original Malayalam Text: ${originalText}
        User's Translation: ${userTranslation}
        Reference Translation: ${referenceTranslation}
        
        For each category, provide:
        1. A score out of 10
        2. 3-5 clear bullet points highlighting strengths and weaknesses
        
        Format your response as a JSON object with this structure:
        {
          "correctWordUsage": {
            "score": number,
            "points": [string, string, ...]
          },
          "sentenceStructure": {
            "score": number,
            "points": [string, string, ...]
          },
          "grammarMistakes": {
            "score": number,
            "points": [string, string, ...]
          },
          "completeness": {
            "score": number,
            "points": [string, string, ...]
          },
          "feedback": string
        }
        
        IMPORTANT: 
        - Return ONLY the JSON object without any markdown formatting, explanations, or code blocks
        - Do NOT include backticks (\`\`\`) or "json" tags in your response
        - Keep each bullet point brief and focused on a single issue
        - Be specific and provide examples from the text
      `;
      
      const scoringResult = await model.generateContent(scoringPrompt);
      const scoringResponse = scoringResult.response.text().trim();
      
      // Parse the JSON response with error handling
      let scoringData;
      try {
        // First extract clean JSON from response if it's wrapped in code blocks
        const cleanJsonText = extractJsonFromResponse(scoringResponse);
        // Then parse the cleaned text
        scoringData = JSON.parse(cleanJsonText);
      } catch (e) {
        console.error("Failed to parse scoring response:", e);
        console.error("Raw response:", scoringResponse); // Log the raw response for debugging
        
        // Try a fallback approach - if the model didn't cooperate, use default values
        scoringData = {
          correctWordUsage: { score: 5, points: ["Unable to parse detailed analysis."] },
          sentenceStructure: { score: 5, points: ["Unable to parse detailed analysis."] },
          grammarMistakes: { score: 5, points: ["Unable to parse detailed analysis."] },
          completeness: { score: 5, points: ["Unable to parse detailed analysis."] },
          feedback: "Translation assessment completed, but detailed analysis is unavailable."
        };
      }
      
      // Calculate contributions and total score
      const wordUsageScore = scoringData.correctWordUsage.score;
      const structureScore = scoringData.sentenceStructure.score;
      const grammarScore = scoringData.grammarMistakes.score;
      const completenessScore = scoringData.completeness.score;
      
      const wordUsageContribution = wordUsageScore * 2; // 20%
      const structureContribution = structureScore * 2; // 20%
      const grammarContribution = grammarScore * 2; // 20%
      const completenessContribution = completenessScore * 4; // 40%
      
      const totalScore = Math.round(
        wordUsageContribution +
        structureContribution +
        grammarContribution +
        completenessContribution
      );

      // Import the TranslationScore model
      const TranslationScoreModel = require("./models/translationscoremodel");
      
      // Check if a score already exists for this attempt
      let existingScore = await TranslationScoreModel.findOne({
        userId,
        translationId,
        attemptNumber
      });

      if (existingScore) {
        // Update existing score
        existingScore.userTranslation = userTranslation;
        existingScore.wordUsageScore = wordUsageScore * 10; // Convert to 0-100 scale
        existingScore.structureScore = structureScore * 10;
        existingScore.grammarScore = grammarScore * 10;
        existingScore.completenessScore = completenessScore * 10;
        existingScore.totalScore = totalScore;
        existingScore.feedback = scoringData.feedback;
        existingScore.scoredAt = new Date();
        await existingScore.save();
      } else {
        // Create a new score entry
        const newScore = new TranslationScoreModel({
          userId,
          translationId,
          attemptNumber,
          userTranslation,
          wordUsageScore: wordUsageScore * 10, // Convert to 0-100 scale
          structureScore: structureScore * 10,
          grammarScore: grammarScore * 10,
          completenessScore: completenessScore * 10,
          totalScore,
          feedback: scoringData.feedback
        });
        
        // Save to database
        await newScore.save();
      }
      
      // Format the response
      const response = {
        Status: "Success",
        attemptNumber,
        feedback: {
          CorrectWordUsage: {
            score: wordUsageScore,
            points: scoringData.correctWordUsage.points,
            contribution: wordUsageContribution.toFixed(0)
          },
          SentenceStructure: {
            score: structureScore,
            points: scoringData.sentenceStructure.points,
            contribution: structureContribution.toFixed(0)
          },
          GrammarMistakes: {
            score: grammarScore,
            points: scoringData.grammarMistakes.points,
            contribution: grammarContribution.toFixed(0)
          },
          Completeness: {
            score: completenessScore,
            points: scoringData.completeness.points,
            contribution: completenessContribution.toFixed(0)
          },
          Total: totalScore,
          Feedback: scoringData.feedback
        }
      };

      // Log results for debugging
      console.log("=== Translation Scoring Results ===");
      console.log(`User ID: ${userId}`);
      console.log(`Translation ID: ${translationId}`);
      console.log(`Attempt Number: ${attemptNumber}`);
      console.log(`Correct Word Usage: ${wordUsageScore}/10 (${wordUsageContribution} points)`);
      console.log(`Sentence Structure: ${structureScore}/10 (${structureContribution} points)`);
      console.log(`Grammar Mistakes: ${grammarScore}/10 (${grammarContribution} points)`);
      console.log(`Completeness: ${completenessScore}/10 (${completenessContribution} points)`);
      console.log(`Total Score: ${totalScore}/100`);
      console.log(`Saved to database`);
      console.log("==================================");

      res.json(response);
    } catch (error) {
      console.error("Translation scoring error:", error);
      res.status(500).json({ 
        Status: "Error", 
        message: "Error analyzing translation",
        error: error.message 
      });
    }
  });
});

app.post("/rephrase/enhance", async (req, res) => {
  let token = req.headers.token;
  let { text } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!text) {
      return res.status(400).json({ "Status": "Text is required" });
    }

    try {
      // Split input text into sentences
      const sentences = text
        .replace(/"\s*(?=[A-Z])/g, '" ')
        .split(/(?<=\.|\?|\!)\s+/)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());

      // Prompt Gemini for sentence rephrasing with new words and meanings
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const prompt = `Rephrase each of the following numbered sentences using advanced vocabulary and improved grammar:
      - Use synonyms to replace key words while maintaining original meaning
      - Change sentence structure (e.g., active to passive or vice versa)
      - Break long sentences or combine short ones when appropriate
      - Use different transitional phrases and conjunctions
      - Reorder information while maintaining logical flow
      - Use nominalizations (verbs to nouns) or vice versa where suitable
      - Correct any grammar errors
      
      For each sentence:
      - Provide the rephrased sentence that preserves the original meaning but uses different wording and structure
      - List all new/replaced words and their original counterparts as a comma-separated string, prefixed with "Replaced: " (e.g., "Replaced: 'large' with 'enormous', 'quickly' with 'swiftly'")
      - Provide brief definitions of all new words as a comma-separated string, prefixed with "Meanings: " (e.g., "Meanings: enormous - extremely large, swiftly - at high speed")
      
      Separate each sentence's analysis with a blank line. Use this format:
      **<number>.**
      Original: "<original sentence>"
      Rephrased: "<rephrased sentence>"
      Replaced: "<original word> with <new word>, <original word> with <new word>, ..."
      Meanings: "<new word> - <definition>, <new word> - <definition>, ..."

      If no improvements can be made, say "No rephrasing needed" for Rephrased, Replaced, and Meanings fields.

      Input:
      ${numberedText}`;

      const result = await model.generateContent(prompt);
      console.log('Raw Gemini Response (Rephrasing):', result.response.text());

      // Parse the response
      const responseText = result.response.text();
      const feedbackBlocks = responseText.split('\n\n').filter(block => block.trim());
      const feedback = sentences.map((original, i) => {
        const block = feedbackBlocks.find(b => b.startsWith(`**${i + 1}.**`)) || '';
        const lines = block.split('\n').filter(line => line.trim());

        const originalLine = lines.find(line => line.startsWith('Original:')) || `Original: "${original}"`;
        const rephrasedLine = lines.find(line => line.startsWith('Rephrased:')) || 'Rephrased: No rephrasing needed';
        const replacedLine = lines.find(line => line.startsWith('Replaced:')) || 'Replaced: No rephrasing needed';
        const meaningsLine = lines.find(line => line.startsWith('Meanings:')) || 'Meanings: No rephrasing needed';

        return {
          original: originalLine.replace('Original: "', '').replace('"', '').trim(),
          rephrased: rephrasedLine.replace('Rephrased: ', '').replace(/^"(.*)"$/, '$1').trim(),
          replaced: replacedLine.replace('Replaced: ', '').trim(),
          meanings: meaningsLine.replace('Meanings: ', '').trim(),
        };
      });

      console.log('Parsed Feedback (Rephrasing):', JSON.stringify(feedback, null, 2));
      res.json({
        "Status": "Success",
        feedback,
      });
    } catch (error) {
      console.error('Rephrasing error:', error);
      res.status(500).json({ "Status": "Error", error: "Error rephrasing text" });
    }
  });
});

app.get("/user-stories/:userId", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let userId = req.params.userId;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request parameter
    if (!userId) {
      return res.status(400).json({
        Status: "Error",
        message: "User ID is required",
      });
    }

    try {
      // Import required models - adjust paths based on your project structure
      const mongoose = require('mongoose');
      const UserStoryModel = mongoose.model('UserStory');
      const StoryScore = mongoose.model('StoryScore');
      
      // Convert userId to ObjectId to ensure proper matching
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Find all user stories and populate the story reference
      const userStories = await UserStoryModel.find({ userId: userObjectId })
        .populate({
          path: 'storyId',
          select: 'title storyText',
        })
        .sort({ submittedAt: -1 });
      
      // Fetch all scores for this user
      const allScores = await StoryScore.find({ userId: userObjectId });
      
      console.log(`Found ${allScores.length} score entries for user ${userId}`);
      
      // Log entire score documents for debugging
      console.log("Score documents found:");
      allScores.forEach((score, index) => {
        console.log(`Score document ${index + 1}:`);
        console.log(JSON.stringify({
          userId: score.userId,
          storyId: score.storyId,
          attemptNumber: score.attemptNumber,
          scores: score.scores,
          overallFeedback: score.overallFeedback
        }, null, 2));
      });
      
      // Format the response, handling potential null references
      const formattedStories = await Promise.all(userStories.map(async (story) => {
        // Base story information
        const baseStoryInfo = {
          _id: story._id,
          storyId: story.storyId ? story.storyId._id : null,
          storyTitle: story.storyId ? (story.storyId.title || "Untitled Story") : "Unavailable Story",
          originalStory: story.storyId ? (story.storyId.storyText || "Original text unavailable") : "The original story is no longer available.",
          attempts: []
        };
        
        // Add all attempts if they exist
        if (story.attempts && story.attempts.length > 0) {
          // Sort attempts by attemptNumber
          const sortedAttempts = [...story.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
          
          baseStoryInfo.attempts = await Promise.all(sortedAttempts.map(async (attempt) => {
            // Find matching score document
            const storyIdString = story.storyId ? story.storyId._id.toString() : '';
            
            console.log(`Looking for score for storyId: ${storyIdString}, attemptNumber: ${attempt.attemptNumber}`);
            
            const scoreEntry = allScores.find(score => {
              const scoreStoryIdStr = score.storyId ? score.storyId.toString() : '';
              const match = scoreStoryIdStr === storyIdString && score.attemptNumber === attempt.attemptNumber;
              console.log(`Comparing score.storyId: ${scoreStoryIdStr} with story.storyId: ${storyIdString}, attempt: ${score.attemptNumber} === ${attempt.attemptNumber}, match: ${match}`);
              return match;
            });
            
            // Extract score information if available
            let scoreData = null;
            let isScored = false;
            
            if (scoreEntry) {
              console.log(`Found score for story ${storyIdString}, attempt #${attempt.attemptNumber}`);
              console.log("Raw score entry:", JSON.stringify(scoreEntry, null, 2));
              
              isScored = true;
              
              // Access the scores object correctly
              if (scoreEntry.scores) {
                scoreData = {
                  total: scoreEntry.scores.total || 0,
                  narrativeFlow: scoreEntry.scores.narrativeFlow?.score || 0,
                  creativity: scoreEntry.scores.creativity?.score || 0,
                  structure: scoreEntry.scores.structure?.score || 0,
                  grammar: scoreEntry.scores.grammar?.score || 0,
                  overallFeedback: scoreEntry.overallFeedback || ""
                };
              } else if (scoreEntry.total !== undefined) {
                // If scores aren't nested under 'scores' object but are direct properties
                scoreData = {
                  total: scoreEntry.total || 0,
                  narrativeFlow: scoreEntry.narrativeFlow?.score || 0,
                  creativity: scoreEntry.creativity?.score || 0,
                  structure: scoreEntry.structure?.score || 0,
                  grammar: scoreEntry.grammar?.score || 0,
                  overallFeedback: scoreEntry.overallFeedback || ""
                };
              }
              
              console.log("Score data extracted:", JSON.stringify(scoreData, null, 2));
            } else {
              console.log(`No score found for story ${storyIdString}, attempt #${attempt.attemptNumber}`);
            }
            
            const wordCount = attempt.completedStory ? calculateWordCount(attempt.completedStory) : 0;
            
            return {
              attemptNumber: attempt.attemptNumber,
              completedStory: attempt.completedStory,
              submittedAt: attempt.submittedAt,
              wordCount: wordCount,
              isScored: isScored,
              scores: scoreData
            };
          }));
        }
        
        return baseStoryInfo;
      }));

      // Log the final response that is being sent to the frontend
      console.log("Response sent to frontend for /user-stories/:userId:");
      console.log(JSON.stringify(formattedStories, null, 2));

      return res.status(200).json(formattedStories);
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return res.status(500).json({ 
        Status: "Error", 
        message: "Server error while fetching user stories",
        error: error.message
      });
    }
  });
});
// Helper function to calculate word count
function calculateWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

// Helper function to calculate word count if not stored in DB
function calculateWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

// POST endpoint for scoring story completions
app.get("/user-stories/:userId", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let userId = req.params.userId;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request parameter
    if (!userId) {
      return res.status(400).json({
        Status: "Error",
        message: "User ID is required",
      });
    }

    try {
      // Import required models - adjust paths based on your project structure
      const mongoose = require('mongoose');
      const UserStoryModel = mongoose.model('UserStory');
      const StoryScore = mongoose.model('StoryScore');
      
      // Convert userId to ObjectId to ensure proper matching
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Find all user stories and populate the story reference
      const userStories = await UserStoryModel.find({ userId: userObjectId })
        .populate({
          path: 'storyId',
          select: 'title storyText',
        })
        .sort({ submittedAt: -1 });
      
      // Fetch all scores for this user
      const allScores = await StoryScore.find({ userId: userObjectId });
      
      console.log(`Found ${allScores.length} score entries for user ${userId}`);
      
      // Format the response, handling potential null references
      const formattedStories = await Promise.all(userStories.map(async (story) => {
        // Base story information
        const baseStoryInfo = {
          _id: story._id,
          storyId: story.storyId ? story.storyId._id : null,
          storyTitle: story.storyId ? (story.storyId.title || "Untitled Story") : "Unavailable Story",
          originalStory: story.storyId ? (story.storyId.storyText || "Original text unavailable") : "The original story is no longer available.",
          attempts: []
        };
        
        // Add all attempts if they exist
        if (story.attempts && story.attempts.length > 0) {
          // Sort attempts by attemptNumber
          const sortedAttempts = [...story.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
          
          baseStoryInfo.attempts = await Promise.all(sortedAttempts.map(async (attempt) => {
            // Find matching score document
            const storyIdString = story.storyId ? story.storyId._id.toString() : '';
            
            console.log(`Looking for score for storyId: ${storyIdString}, attemptNumber: ${attempt.attemptNumber}`);
            
            const scoreEntry = allScores.find(score => 
              score.storyId.toString() === storyIdString && 
              score.attemptNumber === attempt.attemptNumber
            );
            
            // Extract score information if available
            let scoreData = null;
            let isScored = false;
            
            if (scoreEntry) {
              console.log(`Found score for story ${storyIdString}, attempt #${attempt.attemptNumber}`);
              isScored = true;
              
              // Access the scores object correctly
              scoreData = {
                total: scoreEntry.scores?.total || 0,
                narrativeFlow: scoreEntry.scores?.narrativeFlow?.score || 0,
                creativity: scoreEntry.scores?.creativity?.score || 0,
                structure: scoreEntry.scores?.structure?.score || 0,
                grammar: scoreEntry.scores?.grammar?.score || 0,
                overallFeedback: scoreEntry.overallFeedback || ""
              };
              
              console.log("Score data extracted:", JSON.stringify(scoreData, null, 2));
            } else {
              console.log(`No score found for story ${storyIdString}, attempt #${attempt.attemptNumber}`);
            }
            
            const wordCount = attempt.completedStory ? calculateWordCount(attempt.completedStory) : 0;
            
            return {
              attemptNumber: attempt.attemptNumber,
              completedStory: attempt.completedStory,
              submittedAt: attempt.submittedAt,
              wordCount: wordCount,
              isScored: isScored,
              scores: scoreData
            };
          }));
        }
        
        return baseStoryInfo;
      }));

      // Log the final response that is being sent to the frontend
      console.log("Response sent to frontend for /user-stories/:userId:");
      console.log(JSON.stringify(formattedStories, null, 2));

      return res.status(200).json(formattedStories);
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return res.status(500).json({ 
        Status: "Error", 
        message: "Server error while fetching user stories",
        error: error.message
      });
    }
  });
});


// Helper function to extract JSON from response text
function extractJsonFromResponse(responseText) {
  // Try to find JSON content between code blocks if present
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = responseText.match(jsonRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no code blocks, find content that looks like a JSON object
  const possibleJson = responseText.trim();
  if (possibleJson.startsWith('{') && possibleJson.endsWith('}')) {
    return possibleJson;
  }
  
  // Return the original if no clear JSON pattern is found
  return responseText;
}

// Add this helper function at the top of your app.js file
function safeGet(obj, path, defaultValue = 0) {
  const keys = path.split('.');
  return keys.reduce((acc, key) => {
    return (acc && acc[key] !== undefined) ? acc[key] : defaultValue;
  }, obj);
}

// Make sure your extractJsonFromResponse function is defined somewhere
app.post("/score-rephrase", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let { originalText, rephrasedText, rephraseId, userId, attemptNumber } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request body
    if (!originalText || !rephrasedText) {
      return res.status(400).json({
        Status: "Error",
        message: "Original text and rephrased text are required",
      });
    }

    if (!rephraseId) {
      return res.status(400).json({
        Status: "Error",
        message: "Rephrase ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        Status: "Error",
        message: "User ID is required",
      });
    }

    if (!attemptNumber) {
      return res.status(400).json({
        Status: "Error",
        message: "Attempt number is required",
      });
    }

    try {
      // Comprehensive evaluation prompt with explicit instructions
      const scoringPrompt = `
        You are an expert language evaluator assessing the quality of sentence rephrasing.
        
        Original Sentence: "${originalText}"
        Rephrased Sentence: "${rephrasedText}"
        
        Evaluate this rephrasing based on four key criteria:
        
        1. Semantic Accuracy: How well the rephrased sentence maintains the original meaning (10 points)
        2. Sentence Structure: How effectively the sentence structure was changed while maintaining clarity (10 points)
        3. Grammar: The grammatical correctness of the rephrased sentence (10 points)
        4. Creativity: How creative and original the rephrasing is while maintaining meaning (10 points)
        
        For each criterion:
        1. Provide a score out of 10 (be critical and don't inflate scores)
        2. Write a detailed paragraph explaining your assessment 
        3. List 3-4 specific observations with exact examples from the text
        4. For grammar mistakes, explain what's incorrect and suggest corrections
        
        Conclude with:
        1. Calculate a total score out of 100 (each criterion is worth 25%)
        2. A brief summary paragraph of the overall quality
        
        Format your response as a JSON object with this exact structure:
        {
          "CorrectWordUsage": {
            "score": number,
            "points": ["string", "string", ...],
            "feedback": "Detailed paragraph explaining semantic accuracy assessment"
          },
          "SentenceStructure": {
            "score": number,
            "points": ["string", "string", ...],
            "feedback": "Detailed paragraph explaining sentence structure assessment"
          },
          "GrammarMistakes": {
            "score": number,
            "points": ["string", "string", ...],
            "feedback": "Detailed paragraph explaining grammar assessment"
          },
          "Completeness": {
            "score": number,
            "points": ["string", "string", ...],
            "feedback": "Detailed paragraph explaining creativity assessment"
          },
          "Total": number,
          "Feedback": "Overall summary paragraph"
        }
        
        IMPORTANT: 
        - Make the feedback paragraph for each criterion at least 3-4 sentences long with specific details
        - Be honest and critical in your assessment
        - Provide specific examples from the text for each point
        - Score each criterion fairly without inflation
        - Be detailed and clear in your feedback
        - Ensure that every field has complete and properly formatted content
      `;
      
      const scoringResult = await model.generateContent(scoringPrompt);
      const scoringResponse = scoringResult.response.text().trim();
      
      // Parse the JSON response with error handling
      let scoringData;
      try {
        // Extract clean JSON from response if it's wrapped in code blocks
        const cleanJsonText = extractJsonFromResponse(scoringResponse);
        // Then parse the cleaned text
        scoringData = JSON.parse(cleanJsonText);
        
        // Log the parsed response for debugging
        console.log("Successfully parsed response:", JSON.stringify(scoringData, null, 2));
      } catch (e) {
        console.error("Failed to parse rephrase scoring response:", e);
        console.error("Raw response:", scoringResponse); // Log the raw response for debugging
        
        // Use detailed fallback values
        scoringData = {
          CorrectWordUsage: { 
            score: 5, 
            points: [
              "The rephrased text partially maintains the original meaning.",
              "Some key concepts from the original are missing or altered.",
              "Word choices occasionally change the intended meaning."
            ],
            feedback: "The semantic accuracy of your rephrasing needs improvement. While some core ideas are preserved, there are instances where the meaning shifts from the original. Pay attention to how your word choices might subtly alter the intended message. Consider reviewing the original text more carefully to ensure you capture all the key points and nuances."
          },
          SentenceStructure: { 
            score: 5, 
            points: [
              "Sentence structures are similar to the original with minimal variation.",
              "Limited use of different sentence patterns or constructions.",
              "More variety in syntax would improve the rephrasing quality."
            ],
            feedback: "Your sentence structure shows limited variation from the original text. A good rephrasing should demonstrate flexibility in syntax while maintaining clarity. Consider employing different sentence patterns such as changing active to passive voice, combining short sentences, or breaking down longer ones. This would showcase better command of language structure and improve the overall quality of your rephrasing."
          },
          GrammarMistakes: { 
            score: 5, 
            points: [
              "Several grammatical errors are present in the rephrased text.",
              "Issues with subject-verb agreement, articles, or tense consistency.",
              "These errors impact the clarity and professionalism of the rephrasing."
            ],
            feedback: "The rephrased text contains various grammatical issues that affect its quality. Common problems include incorrect subject-verb agreement, improper article usage, and inconsistent verb tenses. These errors significantly detract from the effectiveness of your rephrasing and make the text less polished. Reviewing basic grammar rules and proofreading carefully would help improve the grammatical accuracy of your work."
          },
          Completeness: { 
            score: 5, 
            points: [
              "The rephrasing shows limited creativity and originality.",
              "Many words are simply repeated from the original text.",
              "More advanced vocabulary and phrasing alternatives would enhance the rephrasing."
            ],
            feedback: "Your creative approach to rephrasing could be significantly improved. The current version relies heavily on the original phrasing with minimal transformation. Effective rephrasing involves introducing fresh vocabulary, alternative expressions, and new ways to convey the same ideas. Consider using more sophisticated vocabulary, idiomatic expressions, or figurative language where appropriate to demonstrate linguistic creativity while preserving the core meaning."
          },
          Total: 50,
          Feedback: "Overall, this rephrasing demonstrates basic competence but has considerable room for improvement across all assessment criteria. With more attention to semantic accuracy, sentence structure variation, grammatical correctness, and creative language use, the quality could be substantially enhanced. Focus particularly on grammar correction and introducing more varied vocabulary to elevate your rephrasing skills."
        };
      }
      
      // Calculate total score
      const semanticScore = scoringData.CorrectWordUsage?.score || 5;
      const structureScore = scoringData.SentenceStructure?.score || 5;
      const grammarScore = scoringData.GrammarMistakes?.score || 5;
      const creativityScore = scoringData.Completeness?.score || 5;
      
      const totalScore = Math.round(
        semanticScore * 2.5 +  // 25%
        structureScore * 2.5 + // 25%
        grammarScore * 2.5 +   // 25%
        creativityScore * 2.5   // 25%
      );
      
      // Update the total score
      scoringData.Total = totalScore;
      
      // Store scores in the database
      const RephraseScore = require("./models/rephraseScore"); // Import the schema
      
      // Check if score already exists for this attempt
      let existingScore = await RephraseScore.findOne({
        userId,
        rephraseId,
        attemptNumber
      });

      if (existingScore) {
        // Update existing score
        existingScore.semanticScore = semanticScore * 10; // Convert to 0-100 scale
        existingScore.structureScore = structureScore * 10;
        existingScore.grammarScore = grammarScore * 10;
        existingScore.creativityScore = creativityScore * 10;
        existingScore.totalScore = totalScore;
        existingScore.feedback = scoringData.Feedback || "Score analysis completed.";
        await existingScore.save();
      } else {
        // Create a new score entry
        const newScore = new RephraseScore({
          userId,
          rephraseId,
          attemptNumber,
          semanticScore: semanticScore * 10, // Convert to 0-100 scale
          structureScore: structureScore * 10,
          grammarScore: grammarScore * 10,
          creativityScore: creativityScore * 10,
          totalScore,
          feedback: scoringData.Feedback || "Score analysis completed."
        });
        
        // Save to database
        await newScore.save();
      }
      
      // Ensure the response has the structure your frontend expects
      const response = {
        Status: "Success",
        attemptNumber,
        feedback: {
          CorrectWordUsage: {
            score: semanticScore,
            points: scoringData.CorrectWordUsage?.points || [
              "The rephrased text partially maintains the original meaning.",
              "Some key concepts from the original are missing or altered.",
              "Word choices occasionally change the intended meaning."
            ],
            feedback: scoringData.CorrectWordUsage?.feedback || 
              "The semantic accuracy of your rephrasing needs improvement. While some core ideas are preserved, there are instances where the meaning shifts from the original. Pay attention to how your word choices might subtly alter the intended message. Consider reviewing the original text more carefully to ensure you capture all the key points and nuances."
          },
          SentenceStructure: {
            score: structureScore,
            points: scoringData.SentenceStructure?.points || [
              "Sentence structures are similar to the original with minimal variation.",
              "Limited use of different sentence patterns or constructions.",
              "More variety in syntax would improve the rephrasing quality."
            ],
            feedback: scoringData.SentenceStructure?.feedback || 
              "Your sentence structure shows limited variation from the original text. A good rephrasing should demonstrate flexibility in syntax while maintaining clarity. Consider employing different sentence patterns such as changing active to passive voice, combining short sentences, or breaking down longer ones. This would showcase better command of language structure and improve the overall quality of your rephrasing."
          },
          GrammarMistakes: {
            score: grammarScore,
            points: scoringData.GrammarMistakes?.points || [
              "Several grammatical errors are present in the rephrased text.",
              "Issues with subject-verb agreement, articles, or tense consistency.",
              "These errors impact the clarity and professionalism of the rephrasing."
            ],
            feedback: scoringData.GrammarMistakes?.feedback || 
              "The rephrased text contains various grammatical issues that affect its quality. Common problems include incorrect subject-verb agreement, improper article usage, and inconsistent verb tenses. These errors significantly detract from the effectiveness of your rephrasing and make the text less polished. Reviewing basic grammar rules and proofreading carefully would help improve the grammatical accuracy of your work."
          },
          Completeness: {
            score: creativityScore,
            points: scoringData.Completeness?.points || [
              "The rephrasing shows limited creativity and originality.",
              "Many words are simply repeated from the original text.",
              "More advanced vocabulary and phrasing alternatives would enhance the rephrasing."
            ],
            feedback: scoringData.Completeness?.feedback || 
              "Your creative approach to rephrasing could be significantly improved. The current version relies heavily on the original phrasing with minimal transformation. Effective rephrasing involves introducing fresh vocabulary, alternative expressions, and new ways to convey the same ideas. Consider using more sophisticated vocabulary, idiomatic expressions, or figurative language where appropriate to demonstrate linguistic creativity while preserving the core meaning."
          },
          Total: totalScore,
          Feedback: scoringData.Feedback || 
            "Overall, this rephrasing demonstrates basic competence but has considerable room for improvement across all assessment criteria. With more attention to semantic accuracy, sentence structure variation, grammatical correctness, and creative language use, the quality could be substantially enhanced. Focus particularly on grammar correction and introducing more varied vocabulary to elevate your rephrasing skills."
        }
      };

      // Log results for debugging
      console.log("=== Rephrase Scoring Results ===");
      console.log(`Attempt Number: ${attemptNumber}`);
      console.log(`Semantic Accuracy: ${semanticScore}/10`);
      console.log(`Sentence Structure: ${structureScore}/10`);
      console.log(`Grammar: ${grammarScore}/10`);
      console.log(`Creativity: ${creativityScore}/10`);
      console.log(`Total Score: ${totalScore}/100`);
      console.log(`Saved to database for User ${userId}, Rephrase ${rephraseId}`);
      console.log("==================================");

      res.json(response);
    } catch (error) {
      console.error("Rephrase scoring error:", error);
      res.status(500).json({ 
        Status: "Error", 
        message: "Error analyzing rephrased text",
        error: error.message 
      });
    }
  });
});

// Helper function to extract JSON from AI response
function extractJsonFromResponse(text) {
  // Try to remove any markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
  }
  
  // If no code blocks, return the text as is
  return text.trim();
}
// Helper function to extract JSON from response text
function extractJsonFromResponse(responseText) {
  // Try to find JSON content between code blocks if present
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = responseText.match(jsonRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no code blocks, find content that looks like a JSON object
  const possibleJson = responseText.trim();
  if (possibleJson.startsWith('{') && possibleJson.endsWith('}')) {
    return possibleJson;
  }
  
  // Return the original if no clear JSON pattern is found
  return responseText;
}

// POST endpoint for scoring essays
// POST endpoint for scoring essays with detailed feedback and examples
app.post("/score-essay", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let { topic, essayText, essayId, userId, attemptNumber = 1 } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request body
    if (!topic || !essayText) {
      return res.status(400).json({
        Status: "Error",
        message: "Essay topic and text are required",
      });
    }

    if (!essayId) {
      return res.status(400).json({
        Status: "Error",
        message: "Essay ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        Status: "Error",
        message: "User ID is required",
      });
    }

    try {
      // Comprehensive evaluation prompt with explicit instructions for detailed feedback
      const scoringPrompt = `
        Evaluate this essay based on the following criteria and provide detailed feedback with examples.
        
        Essay Topic: ${topic}
        Student's Essay: ${essayText}
        
        For each category:
        1. Provide a realistic score out of 10 (be critical and accurate, do not inflate scores)
        2. List 2-3 specific strengths with exact examples from the text
        3. List 2-3 areas for improvement with specific examples from the text AND suggest better alternatives
        
        Format your response as a JSON object with this structure:
        {
          "content": {
            "score": number,
            "strengths": [
              {"point": "string", "example": "string from essay"},
              {"point": "string", "example": "string from essay"}
            ],
            "improvements": [
              {"point": "string", "instead": "string from essay", "better": "string suggestion"},
              {"point": "string", "instead": "string from essay", "better": "string suggestion"}
            ]
          },
          "organization": {
            "score": number,
            "strengths": [
              {"point": "string", "example": "string from essay"},
              {"point": "string", "example": "string from essay"}
            ],
            "improvements": [
              {"point": "string", "instead": "string from essay", "better": "string suggestion"},
              {"point": "string", "instead": "string from essay", "better": "string suggestion"}
            ]
          },
          "language": {
            "score": number,
            "strengths": [
              {"point": "string", "example": "string from essay"},
              {"point": "string", "example": "string from essay"}
            ],
            "improvements": [
              {"point": "string", "instead": "string from essay", "better": "string suggestion"},
              {"point": "string", "instead": "string from essay", "better": "string suggestion"}
            ]
          },
          "grammar": {
            "score": number,
            "strengths": [
              {"point": "string", "example": "string from essay"},
              {"point": "string", "example": "string from essay"}
            ],
            "improvements": [
              {"point": "string", "instead": "string from essay", "better": "string suggestion"},
              {"point": "string", "instead": "string from essay", "better": "string suggestion"}
            ]
          },
          "overallFeedback": "string",
          "totalScore": number
        }
        
        IMPORTANT: 
        - Be honest and critical in your assessment. Score realistically for ESL writers.
        - For grammar and language errors, be very specific about what's wrong.
        - Identify patterns of errors rather than just individual mistakes.
        - Return ONLY the JSON object without any markdown formatting, explanations, or code blocks.
        - Do NOT include backticks (\`\`\`) or "json" tags in your response.
        
        SCORING GUIDELINES (be strict and accurate):
        Content (25%): Relevance to topic, development of ideas, examples, and elaboration
          - 9-10: Exceptional, insightful, and original ideas with excellent examples
          - 7-8: Good ideas with adequate support and examples
          - 5-6: Basic ideas with some support but limited development
          - 3-4: Underdeveloped ideas with minimal examples
          - 1-2: Very limited content, off-topic, or irrelevant
          
        Organization (25%): Structure, flow, paragraphing, transitions
          - 9-10: Excellent structure with clear beginning, middle, end; strong transitions
          - 7-8: Good organization with logical flow and adequate transitions
          - 5-6: Basic organization with some attempt at structure but lacking cohesion
          - 3-4: Poor organization with minimal structure
          - 1-2: No clear organization or structure
          
        Language (25%): Vocabulary, word choice, expression, clarity
          - 9-10: Rich, varied vocabulary with precise word choice
          - 7-8: Good vocabulary with mostly appropriate word choice
          - 5-6: Basic vocabulary with some imprecise word choices
          - 3-4: Limited vocabulary with frequent incorrect word usage
          - 1-2: Very poor vocabulary that impedes understanding
          
        Grammar (25%): Sentence structure, verb tense, articles, pronouns, spelling
          - 9-10: Nearly error-free with complex and varied sentence structures
          - 7-8: Few grammar errors that don't impede understanding
          - 5-6: Several grammar errors that occasionally impede understanding
          - 3-4: Frequent grammar errors that often impede understanding
          - 1-2: Severe grammar problems that significantly impede understanding
      `;
      
      const scoringResult = await model.generateContent(scoringPrompt);
      const scoringResponse = scoringResult.response.text().trim();
      
      // Parse the JSON response with error handling
      let scoringData;
      try {
        // Extract clean JSON from response if it's wrapped in code blocks
        const cleanJsonText = extractJsonFromResponse(scoringResponse);
        // Then parse the cleaned text
        scoringData = JSON.parse(cleanJsonText);
      } catch (e) {
        console.error("Failed to parse essay scoring response:", e);
        console.error("Raw response:", scoringResponse); // Log the raw response for debugging
        
        // Use fallback values if parsing fails
        scoringData = {
          content: { 
            score: 5, 
            strengths: [{"point": "Basic idea present", "example": "Unable to extract specific example"}],
            improvements: [{"point": "Need more detail", "instead": "Unable to extract", "better": "Unable to provide specific suggestion"}]
          },
          organization: { 
            score: 5,
            strengths: [{"point": "Basic structure present", "example": "Unable to extract specific example"}],
            improvements: [{"point": "Need better organization", "instead": "Unable to extract", "better": "Unable to provide specific suggestion"}]
          },
          language: { 
            score: 5,
            strengths: [{"point": "Basic vocabulary used", "example": "Unable to extract specific example"}],
            improvements: [{"point": "Need better word choice", "instead": "Unable to extract", "better": "Unable to provide specific suggestion"}]
          },
          grammar: { 
            score: 5,
            strengths: [{"point": "Some sentences structured correctly", "example": "Unable to extract specific example"}],
            improvements: [{"point": "Need grammar improvement", "instead": "Unable to extract", "better": "Unable to provide specific suggestion"}]
          },
          overallFeedback: "Essay assessment completed, but detailed analysis is unavailable.",
          totalScore: 50
        };
      }
      
      // Calculate weighted scores and total if not provided
      if (!scoringData.totalScore) {
        const contentScore = scoringData.content.score;
        const organizationScore = scoringData.organization.score;
        const languageScore = scoringData.language.score;
        const grammarScore = scoringData.grammar.score;
        
        const contentContribution = contentScore * 2.5; // 25%
        const organizationContribution = organizationScore * 2.5; // 25%
        const languageContribution = languageScore * 2.5; // 25%
        const grammarContribution = grammarScore * 2.5; // 25%
        
        scoringData.totalScore = Math.round(
          contentContribution +
          organizationContribution +
          languageContribution +
          grammarContribution
        );
      }
      
      // Format the response in a more readable structure that matches your desired format
      const formattedResponse = {
        Status: "Success",
        attemptNumber,
        feedback: {
          content: {
            score: scoringData.content.score,
            title: "Content & Ideas",
            description: `${scoringData.content.score}/10`,
            strengths: scoringData.content.strengths.map(item => ({
              point: item.point,
              example: item.example
            })),
            improvements: scoringData.content.improvements.map(item => ({
              point: item.point,
              instead: item.instead,
              better: item.better
            }))
          },
          organization: {
            score: scoringData.organization.score,
            title: "Organization & Structure",
            description: `${scoringData.organization.score}/10`,
            strengths: scoringData.organization.strengths.map(item => ({
              point: item.point,
              example: item.example
            })),
            improvements: scoringData.organization.improvements.map(item => ({
              point: item.point,
              instead: item.instead,
              better: item.better
            }))
          },
          language: {
            score: scoringData.language.score,
            title: "Language Use & Vocabulary",
            description: `${scoringData.language.score}/10`,
            strengths: scoringData.language.strengths.map(item => ({
              point: item.point,
              example: item.example
            })),
            improvements: scoringData.language.improvements.map(item => ({
              point: item.point,
              instead: item.instead,
              better: item.better
            }))
          },
          grammar: {
            score: scoringData.grammar.score,
            title: "Grammar & Mechanics",
            description: `${scoringData.grammar.score}/10`,
            strengths: scoringData.grammar.strengths.map(item => ({
              point: item.point,
              example: item.example
            })),
            improvements: scoringData.grammar.improvements.map(item => ({
              point: item.point,
              instead: item.instead,
              better: item.better
            }))
          },
          total: scoringData.totalScore,
          overallFeedback: scoringData.overallFeedback,
          recommendations: [
            "Add specific details and examples to strengthen your ideas",
            "Maintain consistent verb tense throughout your writing",
            "Vary your sentence structures by combining simple sentences",
            "Use more precise and varied vocabulary",
            "Pay attention to grammar, especially articles and verb forms",
            "Create clear topic sentences for each paragraph",
            "Add transitions between ideas to improve flow"
          ]
        }
      };

      // Import the EssayScore model
      const EssayScoreModel = require("./models/EssayScoreModel");
      
      // Check if a score already exists for this attempt
      let existingScore = await EssayScoreModel.findOne({
        userId,
        essayId,
        attemptNumber
      });

      if (existingScore) {
        // Update existing score
        existingScore.essayText = essayText;
        existingScore.contentScore = scoringData.content.score * 10; // Convert to 0-100 scale
        existingScore.organizationScore = scoringData.organization.score * 10;
        existingScore.languageScore = scoringData.language.score * 10;
        existingScore.grammarScore = scoringData.grammar.score * 10;
        existingScore.totalScore = scoringData.totalScore;
        existingScore.feedback = formattedResponse.feedback;
        existingScore.overallFeedback = scoringData.overallFeedback;
        existingScore.scoredAt = new Date();
        await existingScore.save();
      } else {
        // Create a new score entry
        const newScore = new EssayScoreModel({
          userId,
          essayId,
          attemptNumber,
          essayText,
          contentScore: scoringData.content.score * 10, // Convert to 0-100 scale
          organizationScore: scoringData.organization.score * 10,
          languageScore: scoringData.language.score * 10,
          grammarScore: scoringData.grammar.score * 10,
          totalScore: scoringData.totalScore,
          feedback: formattedResponse.feedback,
          overallFeedback: scoringData.overallFeedback
        });
        
        // Save to database
        await newScore.save();
      }

      // Log results for debugging
      console.log("=== Essay Scoring Results ===");
      console.log(`User ID: ${userId}`);
      console.log(`Essay ID: ${essayId}`);
      console.log(`Attempt Number: ${attemptNumber}`);
      console.log(`Content: ${scoringData.content.score}/10`);
      console.log(`Organization: ${scoringData.organization.score}/10`);
      console.log(`Language: ${scoringData.language.score}/10`);
      console.log(`Grammar: ${scoringData.grammar.score}/10`);
      console.log(`Total Score: ${scoringData.totalScore}/100`);
      console.log(`Saved to database`);
      console.log("==================================");

      res.json(formattedResponse);
    } catch (error) {
      console.error("Essay scoring error:", error);
      res.status(500).json({ 
        Status: "Error", 
        message: "Error analyzing essay",
        error: error.message 
      });
    }
  });
});

// Helper function to extract JSON from response text
function extractJsonFromResponse(responseText) {
  // Try to find JSON content between code blocks if present
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = responseText.match(jsonRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no code blocks, find content that looks like a JSON object
  const possibleJson = responseText.trim();
  if (possibleJson.startsWith('{') && possibleJson.endsWith('}')) {
    return possibleJson;
  }
  
  // Return the original if no clear JSON pattern is found
  return responseText;
}

// Helper function to extract JSON from response text
// This handles cases where the model might add extra text or formatting
function extractJsonFromResponse(responseText) {
  // Try to find JSON content between code blocks if present
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = responseText.match(jsonRegex);
  
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // If no code blocks, find content that looks like a JSON object
  const possibleJson = responseText.trim();
  if (possibleJson.startsWith('{') && possibleJson.endsWith('}')) {
    return possibleJson;
  }
  
  // Return the original if no clear JSON pattern is found
  return responseText;
}

// Helper function to extract clean JSON from responses
function extractJsonFromResponse(text) {
  // Check if response is wrapped in markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    // Extract the JSON content from inside the code block
    return jsonMatch[1].trim();
  }
  
  // If no code blocks but starts with a string that's not a proper JSON beginning,
  // try to find the start of JSON
  if (!text.trim().startsWith('{')) {
    const jsonStart = text.indexOf('{');
    if (jsonStart !== -1) {
      return text.substring(jsonStart);
    }
  }
  
  // If no code blocks, return the original text
  return text;
}

// Modified helper function to calculate scores
function calculateScore(feedbackText, criteriaType) {
  if (!feedbackText) return 5;
  
  // Simply return the score provided by the model
  if (typeof feedbackText === 'object' && feedbackText.score) {
    return feedbackText.score;
  }
  
  // Default fallback scoring logic
  const feedback = typeof feedbackText === 'string' ? feedbackText.toLowerCase() : '';
  
  if (criteriaType === "word usage") {
    if (feedback.includes("excellent") || feedback.includes("perfect")) {
      return 10;
    } else if (feedback.includes("minor") || feedback.includes("few")) {
      return 8;
    } else if (feedback.includes("several") || feedback.includes("some")) {
      return 6;
    } else if (feedback.includes("many") || feedback.includes("significant")) {
      return 4;
    } else {
      return 2;
    }
  } else if (criteriaType === "structure") {
    if (feedback.includes("excellent") || feedback.includes("natural flow")) {
      return 10;
    } else if (feedback.includes("minor issues") || feedback.includes("generally good")) {
      return 8;
    } else if (feedback.includes("several structural issues") || feedback.includes("awkward")) {
      return 6;
    } else if (feedback.includes("many structural problems") || feedback.includes("difficult to follow")) {
      return 4;
    } else {
      return 2;
    }
  } else if (criteriaType === "grammar") {
    if (feedback.includes("no grammar mistakes")) {
      return 10;
    } else if (feedback.includes("minor grammar issues") || feedback.includes("1") || feedback.includes("2")) {
      return 8;
    } else if (feedback.includes("several grammar") || feedback.includes("3") || feedback.includes("4")) {
      return 6;
    } else if (feedback.includes("many grammar") || feedback.includes("numerous")) {
      return 4;
    } else {
      return 2;
    }
  } else if (criteriaType === "completeness") {
    if (feedback.includes("fully complete") || feedback.includes("all key ideas")) {
      return 10;
    } else if (feedback.includes("mostly complete") || feedback.includes("minor omissions")) {
      return 8;
    } else if (feedback.includes("partial") || feedback.includes("some key points missing")) {
      return 6;
    } else if (feedback.includes("significant omissions") || feedback.includes("misses many")) {
      return 4;
    } else {
      return 2;
    }
  }
  
  // Default score if no patterns matched
  return 5;
}

// POST endpoint for scoring translations
app.post("/score-translation", async (req, res) => {
  // Get token and request data
  let token = req.headers.token;
  let { originalText, userTranslation } = req.body;

  // Check if token exists
  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  // Verify JWT token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    // Handle invalid token
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    // Validate request body
    if (!originalText || !userTranslation) {
      return res.status(400).json({
        Status: "Error",
        message: "Original text and user translation are required",
      });
    }

    try {
      // Generate reference translation using Gemini
      const referencePrompt = `Translate this Malayalam text to English accurately and naturally:\n${originalText}`;
      const referenceResult = await model.generateContent(referencePrompt);
      const referenceTranslation = referenceResult.response.text().trim();

      // Single comprehensive evaluation prompt with explicit instructions
      const scoringPrompt = `
        Evaluate this Malayalam to English translation based on the following criteria:
        
        Original Malayalam Text: ${originalText}
        User's Translation: ${userTranslation}
        Reference Translation: ${referenceTranslation}
        
        For each category, provide:
        1. A score out of 10
        2. 3-5 clear bullet points highlighting strengths and weaknesses
        
        Format your response as a JSON object with this structure:
        {
          "correctWordUsage": {
            "score": number,
            "points": [string, string, ...]
          },
          "sentenceStructure": {
            "score": number,
            "points": [string, string, ...]
          },
          "grammarMistakes": {
            "score": number,
            "points": [string, string, ...]
          },
          "completeness": {
            "score": number,
            "points": [string, string, ...]
          },
          "feedback": string
        }
        
        IMPORTANT: 
        - Return ONLY the JSON object without any markdown formatting, explanations, or code blocks
        - Do NOT include backticks (\`\`\`) or "json" tags in your response
        - Keep each bullet point brief and focused on a single issue
        - Be specific and provide examples from the text
      `;
      
      const scoringResult = await model.generateContent(scoringPrompt);
      const scoringResponse = scoringResult.response.text().trim();
      
      // Parse the JSON response with error handling
      let scoringData;
      try {
        // First extract clean JSON from response if it's wrapped in code blocks
        const cleanJsonText = extractJsonFromResponse(scoringResponse);
        // Then parse the cleaned text
        scoringData = JSON.parse(cleanJsonText);
      } catch (e) {
        console.error("Failed to parse scoring response:", e);
        console.error("Raw response:", scoringResponse); // Log the raw response for debugging
        
        // Try a fallback approach - if the model didn't cooperate, use default values
        scoringData = {
          correctWordUsage: { score: 5, points: ["Unable to parse detailed analysis."] },
          sentenceStructure: { score: 5, points: ["Unable to parse detailed analysis."] },
          grammarMistakes: { score: 5, points: ["Unable to parse detailed analysis."] },
          completeness: { score: 5, points: ["Unable to parse detailed analysis."] },
          feedback: "Translation assessment completed, but detailed analysis is unavailable."
        };
      }
      
      // Calculate contributions and total score
      const wordUsageScore = scoringData.correctWordUsage.score;
      const structureScore = scoringData.sentenceStructure.score;
      const grammarScore = scoringData.grammarMistakes.score;
      const completenessScore = scoringData.completeness.score;
      
      const wordUsageContribution = wordUsageScore * 2; // 20%
      const structureContribution = structureScore * 2; // 20%
      const grammarContribution = grammarScore * 2; // 20%
      const completenessContribution = completenessScore * 4; // 40%
      
      const totalScore = Math.round(
        wordUsageContribution +
        structureContribution +
        grammarContribution +
        completenessContribution
      );
      
      // Format the response
      const response = {
        Status: "Success",
        feedback: {
          CorrectWordUsage: {
            score: wordUsageScore,
            points: scoringData.correctWordUsage.points,
            contribution: wordUsageContribution.toFixed(0)
          },
          SentenceStructure: {
            score: structureScore,
            points: scoringData.sentenceStructure.points,
            contribution: structureContribution.toFixed(0)
          },
          GrammarMistakes: {
            score: grammarScore,
            points: scoringData.grammarMistakes.points,
            contribution: grammarContribution.toFixed(0)
          },
          Completeness: {
            score: completenessScore,
            points: scoringData.completeness.points,
            contribution: completenessContribution.toFixed(0)
          },
          Total: totalScore,
          Feedback: scoringData.feedback
        }
      };

      // Log results for debugging
      console.log("=== Translation Scoring Results ===");
      console.log(`Correct Word Usage: ${wordUsageScore}/10 (${wordUsageContribution} points)`);
      console.log(`Sentence Structure: ${structureScore}/10 (${structureContribution} points)`);
      console.log(`Grammar Mistakes: ${grammarScore}/10 (${grammarContribution} points)`);
      console.log(`Completeness: ${completenessScore}/10 (${completenessContribution} points)`);
      console.log(`Total Score: ${totalScore}/100`);
      console.log("==================================");

      res.json(response);
    } catch (error) {
      console.error("Translation scoring error:", error);
      res.status(500).json({ 
        Status: "Error", 
        message: "Error analyzing translation",
        error: error.message 
      });
    }
  });
});

app.post("/analyze-story-completion", async (req, res) => {
  let token = req.headers.token;
  let { originalStory, completedStory } = req.body;

  if (!token) {
    return res.status(401).json({ Status: "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Invalid Authentication" });
    }

    if (!originalStory || !completedStory) {
      return res.status(400).json({ Status: "Error", message: "Original story and completed story are required" });
    }

    try {
      // Step 1: Verify relevance
      const relevancePrompt = `Determine if the completed story accurately continues the original incomplete story while retaining its core meaning, context, and setting. Reply with "Relevant" if it does, or "Off-Topic" with a brief explanation if it deviates significantly.
      \nOriginal Story: ${originalStory}
      \nCompleted Story: ${completedStory}`;

      const relevanceResult = await model.generateContent(relevancePrompt);
      const relevanceCheck = relevanceResult.response.text().trim();
      console.log("Relevance Check:", relevanceCheck);

      if (relevanceCheck !== "Relevant") {
        return res.json({ Status: "Error", message: relevanceCheck });
      }

      // Step 2: Grammar analysis of completed story
      const sentences = completedStory
        .split(/(?<=\.|\?|\!)\s+/)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below from a completed story. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes with detailed, user-friendly explanations.
      - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes, say "No grammar mistakes found."
      - Provide the corrected sentence as "Corrected: [corrected sentence]".
      Format each sentence’s analysis as:
      **<number>.**
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation]"
      Corrected: "[corrected sentence]"
      Separate each sentence’s analysis with a blank line.

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Raw Grammar Response:", grammarResponseText);

      // Parse the grammar response
      const grammarFeedback = sentences.map((original, i) => {
        const sentenceRegex = new RegExp(
          `\\*\\*${i + 1}\\.\\*\\*\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Corrected:\\s*"(.*?)"(?=\\s*\\*\\*${i + 2}\\.\\*\\*|\\s*$)`,
          "s"
        );
        const match = grammarResponseText.match(sentenceRegex);

        if (match) {
          const issuesText = match[2].trim();
          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            const issueMatches = issuesText.matchAll(/(\d+\.\s*.*?(?=\n\d+\.|Corrected:|\n\s*$))/gs);
            for (const issueMatch of issueMatches) {
              issues.push(issueMatch[1].replace(/^\d+\.\s*/, "").trim());
            }
            if (issues.length === 0) { // Fallback if regex fails
              issues = issuesText.split("\n").filter(line => line.trim()).map(line => line.trim());
            }
          }
          return {
            original: match[1],
            issues,
            corrected: match[3],
          };
        }
        console.warn(`Parsing failed for sentence ${i + 1}: ${original}`);
        return {
          original,
          issues: ["Unable to analyze grammar due to parsing error."],
          corrected: original,
        };
      });

      // Response
      const response = {
        Status: "Success",
        feedback: {
          relevance: {
            originalStory,
            completedStory,
            result: relevanceCheck,
          },
          grammar: grammarFeedback,
        },
      };
      console.log("Parsed Feedback:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Story completion analysis error:", error);
      res.status(500).json({ Status: "Error", message: "Error analyzing story completion" });
    }
  });
});

app.post("/analyze-rephrase", async (req, res) => {
  let token = req.headers.token;
  let { originalText, rephrasedText } = req.body;

  if (!token) {
    return res.status(401).json({ Status: "Error", message: "Authentication token is required" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ Status: "Error", message: "Invalid authentication token" });
    }

    if (!originalText || !rephrasedText) {
      return res.status(400).json({ Status: "Error", message: "Original and rephrased text are required" });
    }

    try {
      // Step 1: Check semantic equivalence
      const semanticPrompt = `
        Analyze whether the rephrased text conveys the same core meaning as the original text, ignoring grammar or style issues.
        Focus ONLY on semantic equivalence - whether the essential information and main ideas are preserved.
        
        Original Text: "${originalText}"
        Rephrased Text: "${rephrasedText}"
        
        Respond with one of these exact options:
        1. "EQUIVALENT" - If the rephrased text conveys the same essential meaning, even if it has grammar errors
        2. "NOT_EQUIVALENT: [brief explanation]" - If the rephrased text changes or loses important information
      `;

      const semanticResult = await model.generateContent(semanticPrompt);
      const semanticResponse = semanticResult.response.text().trim();
      console.log("Semantic Check:", semanticResponse);

      // Parse response to determine if texts are semantically equivalent
      let isEquivalent = semanticResponse.startsWith("EQUIVALENT");
      let semanticMessage = isEquivalent ? 
        "The rephrased text maintains the core meaning of the original." : 
        semanticResponse.replace("NOT_EQUIVALENT: ", "");

      // Step 2: Grammar analysis of rephrased text with improved format for consistent parsing
      const sentences = rephrasedText.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      
      // Create a more structured prompt that's easier to parse
      const grammarPrompt = `
        Analyze the grammar of each numbered sentence below. For each sentence, provide a structured analysis.
        
        Format your response EXACTLY like this for each sentence:
        
        SENTENCE_START:1
        ORIGINAL:"[exact original sentence]"
        ISSUES_START
        [List each issue as a separate line or "No grammar mistakes found." if none]
        ISSUES_END
        CORRECTED:"[corrected sentence]"
        SENTENCE_END
        
        Here are the sentences to analyze:
        ${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}
      `;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Grammar Analysis Response:", grammarResponseText);

      // Parse the grammar analysis with more reliable markers
      const grammarFeedback = [];
      
      for (let i = 0; i < sentences.length; i++) {
        const sentenceNumber = i + 1;
        const sentenceStartRegex = new RegExp(`SENTENCE_START:${sentenceNumber}\\s*`);
        const startIdx = grammarResponseText.search(sentenceStartRegex);
        
        if (startIdx === -1) {
          // Fallback if the exact format wasn't followed
          grammarFeedback.push({
            original: sentences[i],
            issues: ["Analysis not available for this sentence."],
            corrected: sentences[i]
          });
          continue;
        }
        
        const sentenceEndRegex = new RegExp(`SENTENCE_END`);
        const endMatchIdx = grammarResponseText.substring(startIdx).search(sentenceEndRegex);
        const endIdx = endMatchIdx !== -1 ? startIdx + endMatchIdx : grammarResponseText.length;
        const sentenceBlock = grammarResponseText.substring(startIdx, endIdx + 12); // +12 to include "SENTENCE_END"
        
        // Extract original
        const originalMatch = sentenceBlock.match(/ORIGINAL:"(.*?)"/s);
        const original = originalMatch ? originalMatch[1] : sentences[i];
        
        // Extract issues
        const issuesStartIdx = sentenceBlock.indexOf("ISSUES_START");
        const issuesEndIdx = sentenceBlock.indexOf("ISSUES_END");
        
        let issues = [];
        if (issuesStartIdx !== -1 && issuesEndIdx !== -1) {
          const issuesBlock = sentenceBlock.substring(issuesStartIdx + 12, issuesEndIdx).trim();
          if (issuesBlock.includes("No grammar mistakes found.")) {
            issues = ["No grammar mistakes found."];
          } else {
            issues = issuesBlock.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0);
          }
        } else {
          issues = ["Unable to parse issues for this sentence."];
        }
        
        // Extract corrected
        const correctedMatch = sentenceBlock.match(/CORRECTED:"(.*?)"/s);
        const corrected = correctedMatch ? correctedMatch[1] : sentences[i];
        
        grammarFeedback.push({
          original,
          issues,
          corrected
        });
      }

      // Use a simpler approach as a fallback if the structured approach fails
      if (grammarFeedback.every(item => item.issues.includes("Analysis not available") || 
                                      item.issues.includes("Unable to parse"))) {
        // Fallback to direct analysis for each sentence individually
        console.log("Using fallback grammar analysis method");
        
        const individualGrammarFeedback = [];
        
        for (let i = 0; i < sentences.length; i++) {
          const singleSentencePrompt = `
            Analyze this sentence for grammar errors:
            "${sentences[i]}"
            
            Reply in this exact format:
            ISSUES:
            [List each issue OR "No grammar mistakes found." if none]
            CORRECTED:
            [Write the corrected sentence]
          `;
          
          try {
            const singleResult = await model.generateContent(singleSentencePrompt);
            const responseText = singleResult.response.text();
            
            const issuesMatch = responseText.match(/ISSUES:\s*([\s\S]*?)(?=CORRECTED:|$)/);
            const correctedMatch = responseText.match(/CORRECTED:\s*([\s\S]*?)(?=$)/);
            
            let issues = [];
            if (issuesMatch && issuesMatch[1].trim()) {
              const issuesText = issuesMatch[1].trim();
              if (issuesText.includes("No grammar mistakes found.")) {
                issues = ["No grammar mistakes found."];
              } else {
                issues = issuesText.split('\n')
                  .map(line => line.trim())
                  .filter(line => line.length > 0);
              }
            } else {
              issues = ["Unable to identify specific issues."];
            }
            
            const corrected = correctedMatch && correctedMatch[1].trim() ? 
              correctedMatch[1].trim() : sentences[i];
            
            individualGrammarFeedback.push({
              original: sentences[i],
              issues,
              corrected
            });
          } catch (error) {
            console.error(`Error analyzing sentence ${i+1}:`, error);
            individualGrammarFeedback.push({
              original: sentences[i],
              issues: ["Error in grammar analysis."],
              corrected: sentences[i]
            });
          }
        }
        
        if (individualGrammarFeedback.length === sentences.length) {
          // Use the fallback results if we got responses for all sentences
          grammarFeedback.splice(0, grammarFeedback.length, ...individualGrammarFeedback);
        }
      }

      // Generate a summary of grammar issues
      const grammarIssueCount = grammarFeedback.reduce((count, item) => {
        if (item.issues.length === 1 && 
            (item.issues[0] === "No grammar mistakes found." || 
             item.issues[0].includes("Unable to") || 
             item.issues[0].includes("Error in"))) {
          return count;
        }
        return count + item.issues.length;
      }, 0);

      // Response with structured feedback
      const response = {
        Status: "Success",
        feedback: {
          relevance: { 
            originalText, 
            rephrasedText, 
            result: isEquivalent ? "Relevant" : "Needs Improvement",
            message: semanticMessage,
            isEquivalent: isEquivalent
          },
          grammar: grammarFeedback,
          summary: {
            grammarIssueCount,
            overallAssessment: isEquivalent 
              ? (grammarIssueCount > 0 
                  ? "The rephrased text maintains the core meaning but has some grammar issues that should be fixed."
                  : "The rephrased text maintains the core meaning and has good grammar.")
              : "The rephrased text changes the meaning of the original text."
          }
        },
      };
      
      res.json(response);
    } catch (error) {
      console.error("Rephrase analysis error:", error);
      res.status(500).json({ 
        Status: "Error", 
        message: "Error analyzing rephrase",
        error: error.message
      });
    }
  });
});

app.post("/analyze-essay", async (req, res) => {
  let token = req.headers.token;
  let { topic, essayText } = req.body;

  console.log("Received at /analyze-essay:", { topic, essayText, token });

  if (!token) {
    const response = { Status: "Invalid Authentication" };
    console.log("Response sent:", response);
    return res.status(401).json(response);
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      const response = { Status: "Invalid Authentication" };
      console.log("Response sent:", response);
      return res.status(401).json(response);
    }

    if (!topic || !essayText) {
      const response = { Status: "Error", message: "Topic and essay text are required" };
      console.log("Response sent:", response);
      return res.status(400).json(response);
    }

    try {
      // Step 1: Validate relevance to the topic
      const relevancePrompt = `Determine if the following essay text is relevant to the given topic. Reply with "Relevant" if the essay is primarily about the topic, or "Off-Topic" with a brief explanation if it significantly deviates.
      \nTopic: ${topic}
      \nEssay Text: ${essayText}`;

      const relevanceResult = await model.generateContent(relevancePrompt);
      const relevanceCheck = relevanceResult.response.text().trim();
      console.log("Relevance Check:", relevanceCheck);

      if (relevanceCheck !== "Relevant") {
        const response = { Status: "Error", message: relevanceCheck };
        console.log("Response sent:", response);
        return res.json(response);
      }

      // Step 2: Grammar analysis
      const sentences = essayText.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes. For each mistake:
        - Describe the issue in a clear, detailed, and user-friendly way so the user understands what they did wrong and why it’s incorrect.
        - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes are found, say "No grammar mistakes found."
      - Provide the corrected sentence as "Fixed: [corrected sentence]". Ensure the "Fixed" sentence applies ALL corrections and is different from the original if mistakes are found.

      Format:
      **<number>.**
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation of first mistake]"
      2. "[Detailed explanation of second mistake]"
      (etc.)
      Fixed: "[corrected sentence]"

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Raw Grammar Response:", grammarResponseText);

      // Updated parsing logic
      const grammarFeedback = sentences.map((original, i) => {
        const sentenceRegex = new RegExp(
          `\\*\\*${i + 1}\\.\\*\\*\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Fixed:\\s*"(.*?)"(?=\\s*\\*\\*${i + 2}\\.\\*\\*|\\s*$)`,
          "s"
        );
        const match = grammarResponseText.match(sentenceRegex);

        if (match) {
          const originalText = match[1];
          const issuesText = match[2].trim();
          const fixedText = match[3];

          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            // Updated to handle numbered issues with bold titles
            const issueMatches = issuesText.matchAll(/(\d+\.\s*\*\*(.*?)\*\*.*?(?=\n\d+\.|Fixed:|\n\s*$))/gs);
            for (const issueMatch of issueMatches) {
              const issueText = issueMatch[0].replace(/^\d+\.\s*/, "").trim(); // Remove the number prefix
              issues.push(issueText);
            }
            if (issues.length === 0) {
              // Fallback if no numbered issues found (unlikely but safe)
              issues = issuesText.split("\n").filter(line => line.trim()).map(line => line.trim());
            }
          }

          return {
            original: originalText,
            issues,
            corrected: fixedText,
          };
        } else {
          console.warn(`Parsing failed for sentence ${i + 1}: ${original}`);
          return {
            original,
            issues: ["Unable to analyze grammar due to parsing error."],
            corrected: original,
          };
        }
      });

      // Step 3: Construct response
      const response = {
        Status: "Success",
        feedback: {
          relevance: {
            topic,
            essayText,
            result: relevanceCheck,
          },
          grammar: grammarFeedback,
        },
      };
      console.log("Response sent:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Essay analysis error:", error);
      const response = { Status: "Error", message: "Error analyzing essay" };
      console.log("Response sent:", response);
      res.status(500).json(response);
    }
  });
});

app.post("/image/description-analyze", async (req, res) => {
  let token = req.headers.token;
  let { imageDescription, userText } = req.body;

  console.log("Received at /image/description-analyze:", { imageDescription, userText, token });

  if (!token) {
    const response = { Status: "Invalid Authentication" };
    console.log("Response sent:", response);
    return res.status(401).json(response);
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      const response = { Status: "Invalid Authentication" };
      console.log("Response sent:", response);
      return res.status(401).json(response);
    }

    if (!imageDescription || !userText) {
      const response = { Status: "Error", message: "Image description and user text are required" };
      console.log("Response sent:", response);
      return res.status(400).json(response);
    }

    try {
      // Step 1: Check relevance of user text to image description
      const relevancePrompt = `Determine if the following user text is relevant to the provided image description. Reply with "Relevant" if the user text is primarily about the image description, or "Off-Topic" with a brief explanation if it significantly deviates.

      Image Description: "${imageDescription}"
      User Text: "${userText}"`;

      const relevanceResult = await model.generateContent(relevancePrompt);
      const relevanceFeedback = relevanceResult.response.text().trim();
      console.log("Relevance Feedback:", relevanceFeedback);

      // Step 2: Grammar analysis of user text
      const sentences = userText.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes. For each mistake:
        - Describe the issue in a clear, detailed, and user-friendly way so the user understands what they did wrong and why it’s incorrect.
        - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes are found, say "No grammar mistakes found."
      - Provide the corrected sentence as "Fixed: [corrected sentence]". Ensure the "Fixed" sentence applies ALL corrections and is different from the original if mistakes are found.

      Format:
      **<number>.**
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation of first mistake]"
      2. "[Detailed explanation of second mistake]"
      (etc.)
      Fixed: "[corrected sentence]"

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Raw Grammar Response:", grammarResponseText);

      const grammarFeedback = sentences.map((original, i) => {
        const sentenceRegex = new RegExp(
          `\\*\\*${i + 1}\\.\\*\\*\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Fixed:\\s*"(.*?)"(?=\\s*\\*\\*${i + 2}\\.\\*\\*|\\s*$)`,
          "s"
        );
        const match = grammarResponseText.match(sentenceRegex);

        if (match) {
          const issuesText = match[2].trim();
          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            const issueMatches = issuesText.matchAll(/\d+\.\s*(.*?)(?=\n\d+\.|Fixed:|$)/gs);
            for (const issueMatch of issueMatches) {
              issues.push(issueMatch[1].trim());
            }
          }

          return {
            original: match[1],
            issues,
            corrected: match[3],
          };
        } else {
          console.warn(`Parsing failed for sentence ${i + 1}: ${original}`);
          return {
            original,
            issues: ["Unable to analyze grammar due to parsing error."],
            corrected: original,
          };
        }
      });

      // Step 3: Construct response
      const response = {
        Status: "Success",
        feedback: {
          relevance: {
            imageDescription,
            userText,
            result: relevanceFeedback,
          },
          grammar: grammarFeedback,
        },
      };
      console.log("Response sent:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Image description analysis error:", error);
      const response = { Status: "Error", message: "Error analyzing image description" };
      console.log("Response sent:", response);
      res.status(500).json(response);
    }
  });
});

app.post("/translation/analyze", async (req, res) => {
  let token = req.headers.token;
  let { translationId, userTranslation, malayalamText } = req.body;

  console.log("Received at /translation/analyze:", { translationId, userTranslation, malayalamText, token });

  if (!token) {
    const response = { Status: "Invalid Authentication" };
    console.log("Response sent:", response);
    return res.status(401).json(response);
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      const response = { Status: "Invalid Authentication" };
      console.log("Response sent:", response);
      return res.status(401).json(response);
    }

    if (!userTranslation || (!translationId && !malayalamText)) {
      const response = { Status: "Error", message: "User translation and either translationId or malayalamText are required" };
      console.log("Response sent:", response);
      return res.status(400).json(response);
    }

    try {
      // Step 1: Fetch or use Malayalam text
      let originalMalayalamText = malayalamText;
      if (!originalMalayalamText && translationId) {
        const translationDoc = await db.collection("translations").findOne({ _id: translationId });
        if (!translationDoc || !translationDoc.malayalamText) {
          const response = { Status: "Error", message: "Translation ID not found or no Malayalam text available" };
          console.log("Response sent:", response);
          return res.status(404).json(response);
        }
        originalMalayalamText = translationDoc.malayalamText;
      }

      // Step 2: Translate Malayalam to English using Gemini
      const translationPrompt = `Translate the following Malayalam text to English accurately:
      \nMalayalam Text: ${originalMalayalamText}`;
      const translationResult = await model.generateContent(translationPrompt);
      const aiTranslation = translationResult.response.text().trim();
      console.log("AI Translation:", aiTranslation);

      // Step 3: Check translation accuracy
      const accuracyPrompt = `Compare the following two English translations of a Malayalam text and determine if they convey the same meaning. Reply with "Accurate" if they are essentially the same, or "Inaccurate" with a brief explanation if they differ significantly.
      \nAI Translation: ${aiTranslation}
      \nUser Translation: ${userTranslation}`;
      const accuracyResult = await model.generateContent(accuracyPrompt);
      const accuracyCheck = accuracyResult.response.text().trim();
      const accuracyFeedback = accuracyCheck;

      // Step 4: Grammar analysis of user’s translation
      const sentences = userTranslation.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes. For each mistake:
        - Describe the issue in a clear, detailed, and user-friendly way so the user understands what they did wrong and why it’s incorrect.
        - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes are found, say "No grammar mistakes found."
      - Provide the corrected sentence as "Fixed: [corrected sentence]". Ensure the "Fixed" sentence applies ALL corrections and is different from the original if mistakes are found.

      Format:
      **<number>.**
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation of first mistake]"
      2. "[Detailed explanation of second mistake]"
      (etc.)
      Fixed: "[corrected sentence]"

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Raw Grammar Response:", grammarResponseText);

      const grammarFeedback = sentences.map((original, i) => {
        const sentenceRegex = new RegExp(
          `\\*\\*${i + 1}\\.\\*\\*\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Fixed:\\s*"(.*?)"(?=\\s*\\*\\*${i + 2}\\.\\*\\*|\\s*$)`,
          "s"
        );
        const match = grammarResponseText.match(sentenceRegex);

        if (match) {
          const issuesText = match[2].trim();
          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            const issueMatches = issuesText.matchAll(/\d+\.\s*(.*?)(?=\n\d+\.|Fixed:|$)/gs);
            for (const issueMatch of issueMatches) {
              issues.push(issueMatch[1].trim());
            }
          }

          return {
            original: match[1],
            issues,
            corrected: match[3],
          };
        } else {
          console.warn(`Parsing failed for sentence ${i + 1}: ${original}`);
          return {
            original,
            issues: ["Unable to analyze grammar due to parsing error."],
            corrected: original,
          };
        }
      });

      // Step 5: Vocabulary enhancement of user’s translation
      const vocabPrompt = `Enhance the vocabulary in the following numbered sentences, considering the context of the entire paragraph for a cohesive narrative. For each sentence:
      - Provide the enhanced sentence with improved vocabulary, replacing multiple words (as many as suitable) with synonyms or more precise words that fit the context. Do not change the tense or form of the replaced words (e.g., "send" stays a base verb, not "sent"). Do not correct grammar here; focus only on vocabulary.
      - List all replaced words and their replacements as a comma-separated string, prefixed with "Replaced: " (e.g., "Replaced: 'big' with 'enormous', 'fast' with 'swiftly'").
      - Provide brief definitions of all replacement words as a comma-separated string, prefixed with "Meanings: " (e.g., "Meanings: Enormous means very large, Swiftly means moving quickly").
      Separate each sentence’s analysis with a blank line. Use this format:
      **<number>.**
      Original: "<original sentence>"
      Enhanced: "<enhanced sentence>"
      Replaced: "<original word> with <new word>, <original word> with <new word>, ..."
      Meanings: "<definition of new word>, <definition of new word>, ..."

      If no enhancement is needed, say "No enhancement needed" for Enhanced, Replaced, and Meanings fields.

      Input:
      ${numberedText}`;

      const vocabResult = await model.generateContent(vocabPrompt);
      const vocabResponseText = vocabResult.response.text();
      console.log("Raw Vocabulary Response:", vocabResponseText);

      const vocabFeedback = sentences.map((original, i) => {
        const block = vocabResponseText.split('\n\n').find(b => b.startsWith(`**${i + 1}.**`)) || '';
        const lines = block.split('\n').filter(line => line.trim());

        const originalLine = lines.find(line => line.startsWith('Original:')) || `Original: "${original}"`;
        const enhancedLine = lines.find(line => line.startsWith('Enhanced:')) || 'Enhanced: No enhancement needed';
        const replacedLine = lines.find(line => line.startsWith('Replaced:')) || 'Replaced: No enhancement needed';
        const meaningsLine = lines.find(line => line.startsWith('Meanings:')) || 'Meanings: No enhancement needed';

        return {
          original: originalLine.replace('Original: "', '').replace('"', '').trim(),
          enhanced: enhancedLine.replace('Enhanced: ', '').trim(),
          replaced: replacedLine.replace('Replaced: ', '').trim(),
          meanings: meaningsLine.replace('Meanings: ', '').trim(),
        };
      });

      // Step 6: Construct response
      const response = {
        Status: "Success",
        feedback: {
          translationAccuracy: {
            aiTranslation,
            userTranslation,
            result: accuracyFeedback,
          },
          grammar: grammarFeedback,
          vocabulary: vocabFeedback,
        },
      };
      console.log("Response sent:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Translation analysis error:", error);
      const response = { Status: "Error", message: "Error analyzing translation" };
      console.log("Response sent:", response);
      res.status(500).json(response);
    }
  });
});

app.post("/diary/score", async (req, res) => {
  let token = req.headers.token;
  let { text, prompt, section } = req.body;

  console.log("Received at /diary/score:", { text, prompt, section, token });
  if (!token) {
    const response = { Status: "Invalid Authentication" };
    console.log("Response sent:", response);
    return res.status(401).json(response);
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      const response = { Status: "Invalid Authentication" };
      console.log("Response sent:", response);
      return res.status(401).json(response);
    }

    if (!text || !section) {
      const response = { Status: "Text and section are required" };
      console.log("Response sent:", response);
      return res.status(400).json(response);
    }

    try {
      // Step 1: Validate relevance
      let validationPrompt = "";
      switch (section) {
        case "Prompt":
          if (!prompt) {
            const response = { Status: "Error", message: "Prompt is required for Prompt section" };
            console.log("Response sent:", response);
            return res.status(400).json(response);
          }
          validationPrompt = `Check if the following response correctly answers the given prompt. If it does, reply "Relevant". If not, reply "Off-topic".
          \nPrompt: ${prompt}
          \nResponse: ${text}`;
          break;
        case "gratitude":
          validationPrompt = `Check if the following text expresses gratitude. If it does, reply "Relevant". If not, reply "Not gratitude-related".
          \nText: ${text}`;
          break;
        case "goals":
          validationPrompt = `Check if the following text talks about goals for the future. If it does, reply "Relevant". If not, reply "Not about future goals".
          \nText: ${text}`;
          break;
        case "improvement":
          validationPrompt = `Check if the following text describes what could have been done better in a situation. If it does, reply "Relevant". If not, reply "Not about self-improvement".
          \nText: ${text}`;
          break;
        case "narrative":
          validationPrompt = `Check if the following text is a personal daily reflection or a short story. If it is, reply "Relevant". If not, reply "Not a narrative".
          \nText: ${text}`;
          break;
        default:
          const response = { Status: "Error", message: "Invalid section type" };
          console.log("Response sent:", response);
          return res.status(400).json(response);
      }

      const validationResult = await model.generateContent(validationPrompt);
      const relevanceCheck = validationResult.response.text().trim();

      if (relevanceCheck !== "Relevant") {
        const response = { Status: "Error", message: `Your response is not appropriate for the ${section} section: ${relevanceCheck}` };
        console.log("Response sent:", response);
        return res.json(response);
      }

      // Step 2: Grammar analysis for Grammar Quality
      const sentences = text.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes. For each mistake:
        - Describe the issue in a clear, detailed, and user-friendly way.
        - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes are found, say "No grammar mistakes found."
      - Provide the corrected sentence as "Fixed: [corrected sentence]".

      Format:
      [Sentence Number]
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation of first mistake]"
      2. "[Detailed explanation of second mistake]"
      (etc.)
      Fixed: "[corrected sentence]"

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarResponseText = grammarResult.response.text();
      console.log("Raw Grammar Response:", grammarResponseText);

      // Parse grammar feedback
      const grammarFeedback = sentences.map((original, i) => {
        const sentenceRegex = new RegExp(
          `\\[${i + 1}\\]\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Fixed:\\s*"(.*?)"(?=\\s*\\[${i + 2}\\]|\\s*$)`,
          "s"
        );
        const match = grammarResponseText.match(sentenceRegex);

        if (match) {
          const issuesText = match[2].trim();
          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            const issueMatches = issuesText.matchAll(/\d+\.\s*(.*?)(?=\n\d+\.|Fixed:|$)/gs);
            for (const issueMatch of issueMatches) {
              issues.push(issueMatch[1].trim());
            }
          }
          return { original: match[1], issues, corrected: match[3] };
        }
        return { original, issues: ["Unable to analyze"], corrected: original };
      });

      // Step 3: Scoring with detailed evaluation
      const words = text.split(/\s+/);
      const totalGrammarIssues = grammarFeedback.reduce((sum, item) => 
        sum + (item.issues[0] === "No grammar mistakes found." ? 0 : item.issues.length), 0);

      // Grammar Quality
      const grammarScore = (() => {
        if (totalGrammarIssues <= 2) return 10;
        if (totalGrammarIssues <= 5) return 8;
        if (totalGrammarIssues <= 9) return 6;
        if (totalGrammarIssues <= 12) return 4;
        if (totalGrammarIssues <= 15) return 2;
        return 0;
      })();
      const grammarEvaluation = {
        severity: totalGrammarIssues <= 5 ? "Errors are minor (e.g., missing commas, minor word choice issues)." : 
                 totalGrammarIssues <= 12 ? "Errors range from minor (e.g., missing commas, '1 percentage') to moderate (e.g., 'having thinking,' 'fonding'), with no severe structural breakdowns." : 
                 "Errors include moderate to severe issues (e.g., incoherent phrasing, major tense errors).",
        frequency: `${totalGrammarIssues} errors in ${sentences.length} sentences (~${(totalGrammarIssues / sentences.length).toFixed(1)} errors per sentence) is ${totalGrammarIssues <= 5 ? "low" : totalGrammarIssues <= 12 ? "moderately high" : "very high"}.`,
        impact: totalGrammarIssues <= 5 ? "Errors are minor and don’t significantly affect understanding." : 
                totalGrammarIssues <= 12 ? "Most errors are noticeable but don’t completely obscure meaning; text remains comprehensible." : 
                "Errors severely disrupt readability and comprehension."
      };
      const grammarReason = totalGrammarIssues <= 5 ? "Few minor errors allow for a high score." : 
                            totalGrammarIssues <= 12 ? "Frequent errors reduce accuracy, though the text is still understandable." : 
                            "Numerous or severe errors significantly lower the score.";

      // Vocabulary Richness
      let vocabScore = 10;
      const wordFreq = {};
      words.forEach(w => wordFreq[w] = (wordFreq[w] || 0) + 1);
      const wasOveruse = wordFreq["was"] > 5 ? 2 : 0;
      const iOveruse = wordFreq["I"] > 8 ? 1 : 0;
      const basicWordsCount = text.match(/\b(things|good|bad|do|did)\b/gi)?.length || 0;
      const fillersCount = text.match(/\b(really|very)\b/gi)?.length || 0;
      vocabScore -= wasOveruse + iOveruse + (basicWordsCount > 4 ? 2 : 0) + (fillersCount > 2 ? 1 : 0);
      vocabScore = Math.max(0, vocabScore);
      const vocabEvaluation = {
        repetition: `Words like 'was' (used ${wordFreq["was"]} times) and 'I' (used ${wordFreq["I"]} times) show ${wasOveruse || iOveruse ? "significant" : "minimal"} repetition.`,
        variety: `Basic words (e.g., 'things,' 'do') appear ${basicWordsCount} times, indicating ${basicWordsCount > 4 ? "limited" : "adequate"} variety.`,
        fillers: `${fillersCount} instances of fillers (e.g., 'really,' 'very') suggest ${fillersCount > 2 ? "overuse" : "controlled use"} of unnecessary words.`
      };
      const vocabReason = vocabScore >= 8 ? "Strong variety with minimal repetition supports a high score." : 
                          vocabScore >= 5 ? "Repetition and reliance on simple words reduce richness, despite some stronger choices (e.g., 'procrastination,' 'immense')." : 
                          "Heavy repetition and basic vocabulary significantly lower the score.";

      // Clarity and Coherence
      let clarityScore = 10;
      const awkwardCount = grammarFeedback.filter(f => f.issues.some(i => i.includes("awkward") || i.includes("confusing"))).length;
      const thenCount = text.match(/\b(then)\b/gi)?.length || 0;
      const connectorCount = text.match(/\b(because|so|although)\b/gi)?.length || 0;
      const wordyCount = sentences.filter(s => s.split(/\s+/).length > 20 && !s.match(/\b(and|but|because)\b/gi)).length;
      const runOnCount = text.match(/\.[^\s][a-z]/g)?.length || 0;
      clarityScore -= (awkwardCount > 0 ? 2 : 0) + (thenCount > 4 && connectorCount === 0 ? 1 : 0) + (wordyCount > 0 ? 1 : 0) + (runOnCount > 0 ? 1 : 0);
      clarityScore = Math.max(0, clarityScore);
      const clarityEvaluation = {
        awkwardness: `${awkwardCount} sentence(s) with awkward or confusing phrasing ${awkwardCount > 0 ? "impair" : "don’t affect"} clarity.`,
        flow: `'Then' used ${thenCount} times with ${connectorCount} logical connectors, indicating ${thenCount > 4 && connectorCount === 0 ? "poor" : "adequate"} transitions.`,
        wordiness: `${wordyCount} overly long sentence(s) without clear structure ${wordyCount > 0 ? "reduce" : "don’t impact"} readability.`
      };
      const clarityReason = clarityScore >= 8 ? "Clear flow and minimal issues support a high score." : 
                            clarityScore >= 5 ? "Awkward phrasing and poor transitions hinder clarity, though the text remains followable." : 
                            "Significant clarity issues make the text hard to understand.";

      // Creativity
      let creativityScore = 10;
      const figurativeCount = text.match(/\b(like|as if)\b/gi)?.length || 0;
      const uniqueWords = new Set(words).size;
      const diversityRatio = uniqueWords / words.length;
      const iStartCount = sentences.filter(s => s.match(/^I\s/i)).length;
      creativityScore -= (figurativeCount === 0 ? 2 : 0) + (diversityRatio < 0.5 ? 2 : 0) + (iStartCount > sentences.length * 0.7 ? 1 : 0);
      creativityScore = Math.max(0, creativityScore);
      const creativityEvaluation = {
        imagery: `${figurativeCount} instance(s) of figurative language (e.g., similes) show ${figurativeCount > 0 ? "some" : "no"} imaginative expression.`,
        diversity: `Word diversity ratio (${diversityRatio.toFixed(2)}) is ${diversityRatio < 0.5 ? "low" : "adequate"}, reflecting ${diversityRatio < 0.5 ? "repetitive" : "varied"} phrasing.`,
        originality: `${iStartCount}/${sentences.length} sentences start with 'I,' indicating ${iStartCount > sentences.length * 0.7 ? "limited" : "sufficient"} structural creativity.`
      };
      const creativityReason = creativityScore >= 8 ? "Strong imaginative elements and variety earn a high score." : 
                               creativityScore >= 5 ? "Some creative touches exist, but repetition and routine phrasing limit originality." : 
                               "Lack of creativity and heavy repetition result in a low score.";

      // Sentence Variety
      let varietyScore = 10;
      const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
      const avgLength = words.length / sentences.length;
      const lengthVariation = sentenceLengths.length > 1 
        ? Math.sqrt(sentenceLengths.reduce((sum, len) => sum + (len - avgLength) ** 2, 0) / (sentenceLengths.length - 1)) 
        : 0;
      const compoundCount = sentences.filter(s => /\b(and|but|or)\b/i.test(s)).length;
      const complexCount = sentences.filter(s => /\b(because|although|since|if)\b/i.test(s)).length;
      varietyScore -= (lengthVariation < 3 ? 2 : 0) + (compoundCount === 0 ? 1 : 0) + (complexCount === 0 ? 1 : 0) + (iStartCount > sentences.length * 0.7 ? 1 : 0);
      varietyScore = Math.max(0, varietyScore);
      const varietyEvaluation = {
        length: `Sentence length variation (std dev: ${lengthVariation.toFixed(1)}) is ${lengthVariation < 3 ? "low" : "good"}, showing ${lengthVariation < 3 ? "uniformity" : "diversity"}.`,
        structure: `${compoundCount} compound and ${complexCount} complex sentence(s) indicate ${compoundCount > 0 && complexCount > 0 ? "good" : "limited"} structural variety.`,
        starts: `${iStartCount}/${sentences.length} sentences start with 'I,' reflecting ${iStartCount > sentences.length * 0.7 ? "repetitive" : "varied"} beginnings.`
      };
      const varietyReason = varietyScore >= 8 ? "Diverse lengths and structures earn a high score." : 
                            varietyScore >= 5 ? "Some variety in length or structure exists, but repetition lowers the score." : 
                            "Uniformity in length and structure significantly reduces variety.";

      const totalScore = grammarScore + vocabScore + clarityScore + creativityScore + varietyScore;

      const response = {
        Status: "Success",
        score: {
          total: totalScore,
          details: [
            {
              name: "Grammar Quality Score",
              evaluation: grammarEvaluation,
              score: grammarScore,
              reason: grammarReason
            },
            {
              name: "Vocabulary Richness Score",
              evaluation: vocabEvaluation,
              score: vocabScore,
              reason: vocabReason
            },
            {
              name: "Clarity and Coherence Score",
              evaluation: clarityEvaluation,
              score: clarityScore,
              reason: clarityReason
            },
            {
              name: "Creativity Score",
              evaluation: creativityEvaluation,
              score: creativityScore,
              reason: creativityReason
            },
            {
              name: "Sentence Variety Score",
              evaluation: varietyEvaluation,
              score: varietyScore,
              reason: varietyReason
            }
          ],
          grammarFeedback // Optional: included for frontend use
        }
      };
      console.log("Response sent:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Scoring error:", error);
      const response = { Status: "Error", message: "Error calculating score" };
      console.log("Response sent:", response);
      res.status(500).json(response);
    }
  });
});

app.post("/diary/grammar-check", async (req, res) => {
  let token = req.headers.token;
  let { text, prompt, section } = req.body;

  console.log("Received at /diary/grammar-check:", { text, prompt, section, token });
  if (!token) {
    const response = { Status: "Invalid Authentication" };
    console.log("Response sent:", response);
    return res.status(401).json(response);
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      const response = { Status: "Invalid Authentication" };
      console.log("Response sent:", response);
      return res.status(401).json(response);
    }

    if (!text || !section) {
      const response = { Status: "Text and section are required" };
      console.log("Response sent:", response);
      return res.status(400).json(response);
    }

    try {
      let validationPrompt = "";
      
      switch (section) {
        case "Prompt":
          validationPrompt = `Check if the following response correctly answers the given prompt. If it does, reply "Relevant". If not, reply "Off-topic".
          \nPrompt: ${prompt}
          \nResponse: ${text}`;
          break;
          
        case "Gratitude":
          validationPrompt = `Check if the following text expresses gratitude. If it does, reply "Relevant". If not, reply "Not gratitude-related".
          \nText: ${text}`;
          break;

        case "Goals":
          validationPrompt = `Check if the following text talks about goals for the future. If it does, reply "Relevant". If not, reply "Not about future goals".
          \nText: ${text}`;
          break;

        case "Improvement":
          validationPrompt = `Check if the following text describes what could have been done better in a situation. If it does, reply "Relevant". If not, reply "Not about self-improvement".
          \nText: ${text}`;
          break;

        case "Narrative":
          validationPrompt = `Check if the following text is a personal daily reflection or a short story. If it is, reply "Relevant". If not, reply "Not a narrative".
          \nText: ${text}`;
          break;

        default:
          const response = { Status: "Error", message: "Invalid section type" };
          console.log("Response sent:", response);
          return res.status(400).json(response);
      }

      const validationResult = await model.generateContent(validationPrompt);
      const relevanceCheck = validationResult.response.text().trim();

      if (relevanceCheck !== "Relevant") {
        const response = { Status: "Error", message: `Your response is not appropriate for the ${section} section.` };
        console.log("Response sent:", response);
        return res.json(response);
      }

      const sentences = text.split(/(?<=\.|\?|\!)\s+/).filter(s => s.trim().length > 0);
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");

      const grammarPrompt = `Analyze the grammar of each sentence below. For each sentence:
      - List the original sentence as "Original: [sentence]".
      - Identify ALL grammar mistakes. For each mistake:
        - Describe the issue in a clear, detailed, and user-friendly way so the user understands what they did wrong and why it’s incorrect.
        - Use a numbered list (e.g., "1. [issue description]") for each mistake.
      - If no mistakes are found, say "No grammar mistakes found."
      - Provide the corrected sentence as "Fixed: [corrected sentence]". Ensure the "Fixed" sentence applies ALL corrections from the identified issues and is different from the original if mistakes are found.

      Format:
      [Sentence Number]
      Original: "[original sentence]"
      Issues:
      1. "[Detailed explanation of first mistake]"
      2. "[Detailed explanation of second mistake]"
      (etc.)
      Fixed: "[corrected sentence]"

      Sentences:
      ${numberedText}`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const responseText = grammarResult.response.text();

      console.log("Raw Gemini Response:", responseText);

      // Detect the numbering format dynamically
      const usesBoldFormat = /\*\*\d+\.\*\*/.test(responseText); // Check for **<number>.**
      const numberPrefix = usesBoldFormat ? "\\*\\*" : "";
      const numberSuffix = usesBoldFormat ? "\\*\\*" : "";

      const feedback = sentences.map((original, i) => {
        // Dynamically construct regex based on detected format
        const sentenceRegex = new RegExp(
          `${numberPrefix}${i + 1}\\.${numberSuffix}\\s*Original:\\s*"(.*?)"\\s*Issues:\\s*([\\s\\S]*?)\\s*Fixed:\\s*"(.*?)"(?=\\s*${numberPrefix}${i + 2}\\.${numberSuffix}\\s*Original:|\\s*$)`,
          "s"
        );
        const match = responseText.match(sentenceRegex);

        if (match) {
          const originalText = match[1];
          const issuesText = match[2].trim();
          const fixedText = match[3];

          let issues = [];
          if (issuesText === "No grammar mistakes found.") {
            issues.push("No grammar mistakes found.");
          } else {
            const issueMatches = issuesText.matchAll(/\d+\.\s*\*\*(.*?):*\*\*\s*(.*?)(?=\n\d+\.|Fixed:|$)/gs);
            for (const issueMatch of issueMatches) {
              const issueTitle = issueMatch[1];
              const issueDesc = issueMatch[2].trim();
              issues.push(`${issueTitle}: ${issueDesc}`);
            }
          }

          return {
            original: originalText,
            issues,
            corrected: fixedText,
          };
        } else {
          console.warn(`Parsing failed for sentence ${i + 1}: ${original}`);
          return {
            original,
            issues: ["Unable to analyze grammar due to parsing error."],
            corrected: original,
          };
        }
      });

      const response = {
        Status: "Success",
        feedback,
      };
      console.log("Response sent:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Grammar check error:", error);
      const response = { Status: "Error", message: "Error checking grammar" };
      console.log("Response sent:", response);
      res.status(500).json(response);
    }
  });
});


app.get("/diary/random-prompts", async (req, res) => {
  const token = req.headers.token;

  // ✅ Check if token exists
  if (!token) {
    return res.status(401).json({ status: "Error", message: "Unauthorized! Token is required." });
  }

  // ✅ Verify the token
  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ status: "Error", message: "Unauthorized! Invalid token." });
    }

    try {
      // ✅ Fetch 3 random prompts from the database
      const prompts = await DiaryPrompt.aggregate([{ $sample: { size: 3 } }]);

      if (!prompts || prompts.length === 0) {
        return res.status(404).json({ status: "Error", message: "No prompts available." });
      }

      res.json({ status: "Success", prompts });
    } catch (error) {
      console.error("Error fetching prompts:", error);
      res.status(500).json({ status: "Error", message: "Failed to fetch prompts." });
    }
  });
});

app.delete("/admin/delete-prompt/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedPrompt = await DiaryPrompt.findByIdAndDelete(id);
    if (!deletedPrompt) {
      return res.status(404).json({ status: "Error", message: "Prompt not found" });
    }
    res.json({ status: "Success", message: "Prompt deleted successfully" });
  } catch (error) {
    console.error("Error deleting prompt:", error);
    res.status(500).json({ status: "Error", message: "Failed to delete prompt" });
  }
});

app.get("/admin/diary-prompts", async (req, res) => {
  try {
    const prompts = await DiaryPrompt.find().sort({ createdAt: -1 }); // Sort by newest first
    res.json({ status: "Success", prompts });
  } catch (error) {
    console.error("Error fetching prompts:", error);
    res.status(500).json({ status: "Error", message: "Failed to fetch prompts" });
  }
});

app.post("/admin/add-diary-prompt",  async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === "") {
      return res.status(400).json({ message: "Prompt question is required." });
    }

    // ✅ Save the new prompt
    const newPrompt = new DiaryPrompt({ question });
    await newPrompt.save();

    res.status(201).json({ message: "Diary prompt added successfully!", data: newPrompt });
  } catch (error) {
    console.error("Error adding diary prompt:", error);
    res.status(500).json({ error: "Error adding diary prompt." });
  }
});

app.post("/letter/vocabulary-enhance", async (req, res) => {
  let token = req.headers.token;
  let { category, letterPrompt, userText } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!category || !letterPrompt || !userText.trim()) {
      return res.status(400).json({ "Status": "All fields are required" });
    }

    try {
      // ✅ Define tone-based vocabulary rules
      let tone = "Neutral"; // Default
      if (category.includes("Formal") || category.includes("Official") || category.includes("Professional")) {
        tone = "Formal";
      } else if (category.includes("Informal")) {
        tone = "Informal";
      }

      // 🔹 Step 1: Enhance Vocabulary
      const vocabPrompt = `
      Analyze and enhance the vocabulary of the following letter.
      - Ensure the tone is "${tone}".
      - Replace words with more suitable alternatives.
      - Maintain proper politeness and professionalism (if formal).
      - Provide:
        1. The enhanced sentence.
        2. The replaced word and its replacement.
        3. A brief definition of the replacement word.
      
      User's Letter:
      "${userText}"`;

      const result = await model.generateContent(vocabPrompt);
      console.log("Raw AI Response (Vocabulary Enhancement):", result.response.text());

      // 🔹 Step 2: Parse the AI Response
      const responseText = result.response.text();
      const feedbackBlocks = responseText.split("\n\n").filter((block) => block.trim());

      const vocabularyFeedback = feedbackBlocks.map((block) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length < 3) return null; // Skip invalid blocks

        return {
          enhanced: lines[0].replace("Enhanced: ", "").trim(),
          replaced: lines[1].replace("Replaced: ", "").trim(),
          meaning: lines[2].replace("Meaning: ", "").trim(),
        };
      }).filter(item => item !== null);

      console.log("Parsed Vocabulary Enhancement Feedback:", vocabularyFeedback);

      res.json({
        "Status": "Success",
        vocabularyEnhancement: vocabularyFeedback,
      });

    } catch (error) {
      console.error("Vocabulary enhancement error:", error);
      res.status(500).json({ "Status": "Error", error: "Error enhancing vocabulary" });
    }
  });
});

app.post("/analyze-letter", async (req, res) => {
  let token = req.headers.token;
  let { category, letterPrompt, userText } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!category || !letterPrompt || !userText.trim()) {
      return res.status(400).json({ "Status": "All fields are required" });
    }

    try {
      // 🔹 Step 1: Validate Topic Relevance
      const topicPrompt = `Analyze the following:
      - **Letter Category:** "${category}"
      - **Letter Prompt:** "${letterPrompt}"
      - **User's Letter:** "${userText}"

      Task:
      - If the user's letter is **on-topic**, return "Valid".
      - If **off-topic**, return "Invalid" and explain why.
      - If it's a **formal letter**, check if it has proper format (greeting, body, closing).
      - If it's **informal**, allow conversational tone but ensure it's relevant.`;

      const topicResult = await model.generateContent(topicPrompt);
      const topicFeedback = topicResult.response.text();
      const isRelevant = topicFeedback.includes("Valid");
      const topicAnalysis = isRelevant ? "✅ Your letter is relevant." : `❌ Off-topic. ${topicFeedback}`;

      // 🔹 Step 2: Grammar Correction
      const grammarPrompt = `Step 1: Rewrite the text in correct English.
      Step 2: Identify all grammar mistakes.
      Step 3: Provide:
      - The original incorrect sentence.
      - The corrected sentence.
      - The grammar mistake.
      - Explanation of the mistake.

      User's letter:
      "${userText}"`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const responseText = grammarResult.response.text();
      const feedbackBlocks = responseText.split("\n\n").filter((block) => block.trim());

      const grammarFeedback = feedbackBlocks.map((block) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length < 2) return null;
        return {
          original: lines[0].replace("Original: ", "").trim(),
          corrected: lines[1].replace("Corrected: ", "").trim(),
          error: lines[2].replace("Error: ", "").trim(),
          explanation: lines[3].replace("Explanation: ", "").trim(),
        };
      }).filter(item => item !== null);

      res.json({
        "Status": "Success",
        isRelevant,
        topicFeedback: topicAnalysis,
        grammarAnalysis: grammarFeedback,
      });

    } catch (error) {
      console.error("Error analyzing letter:", error);
      res.status(500).json({ "Status": "Error", error: "Error analyzing letter" });
    }
  });
});

app.post("/vocabulary/enhance-essay", async (req, res) => {
  let token = req.headers.token;
  let { essayText } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!essayText) {
      return res.status(400).json({ "Status": "Essay text is required" });
    }

    try {
      // ✅ Split text into sentences
      const sentences = essayText
        .replace(/"\s*(?=[A-Z])/g, '" ')
        .split(/(?<=\.|\?|\!)\s+/)
        .filter((s) => s.trim().length > 0)
        .map((s) => s.trim());

      // ✅ Prompt for Vocabulary Enhancement
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
      const prompt = `Enhance the vocabulary of each sentence below. For each sentence, provide:
      - The enhanced sentence with improved vocabulary (without changing meaning).
      - The replaced word and its better alternative.
      - The meaning of the new word.
      - Ensure only one word is replaced in each sentence.
      
      Example:
      1. The view is very beautiful.
      Enhanced: The view is breathtaking.
      Replaced: "beautiful" → "breathtaking"
      Meaning: "Breathtaking" means extremely impressive or stunning.

      Input:
      ${numberedText}`;

      const result = await model.generateContent(prompt);
      console.log("Raw AI Response (Vocabulary):", result.response.text());

      // ✅ Parse the AI response
      const responseText = result.response.text();
      const feedbackBlocks = responseText.split("\n\n").filter((block) => block.trim());

      const feedback = sentences.map((original, i) => {
        const block = feedbackBlocks.find((b) => b.startsWith(`${i + 1}.`)) || "";
        const lines = block.split("\n").filter((line) => line.trim());
        
        const enhancedLine = lines.find((line) => line.startsWith(`${i + 1}.`)) || original;
        const replacedLine = lines.find((line) => line.startsWith("Replaced:")) || "Replaced: No improvement needed";
        const meaningLine = lines.find((line) => line.startsWith("Meaning:")) || "Meaning: No enhancement needed";

        return {
          original,
          enhanced: enhancedLine.replace(`${i + 1}. `, "").trim(),
          replaced: replacedLine.replace("Replaced: ", "").trim(),
          meaning: meaningLine.replace("Meaning: ", "").trim(),
        };
      });

      console.log("Parsed Feedback (Vocabulary):", feedback);

      res.json({
        "Status": "Success",
        feedback,
      });

    } catch (error) {
      console.error("Vocabulary enhancement error:", error);
      res.status(500).json({ "Status": "Error", error: "Error enhancing vocabulary" });
    }
  });
});


app.post("/analyze-essays", async (req, res) => {
  let token = req.headers.token;
  let { topic, essayText } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!topic || !essayText) {
      return res.status(400).json({ "Status": "All fields are required" });
    }

    try {
      // 🔹 **Step 1: Check Topic Relevance**
      const topicPrompt = `Analyze the following essay:
      - **Topic:** "${topic}"
      - **User's Essay:** "${essayText}"

      Task:
      - If the essay is **on-topic**, return "Valid".
      - If the essay is **off-topic**, return "Invalid" and explain why.`;

      const topicResult = await model.generateContent(topicPrompt);
      const topicFeedback = topicResult.response.text();
      const isRelevant = topicFeedback.includes("Valid");
      const topicAnalysis = isRelevant
        ? "✅ Your essay is on-topic."
        : `❌ Off-topic. ${topicFeedback}`;

      // 🔹 **Step 2: Grammar Correction**
      const grammarPrompt = `Step 1: Rewrite the following text in correct English.
      Step 2: Compare each sentence from the original text with the rewritten version.
      Step 3: Identify all grammar mistakes, including incorrect verbs, missing articles, subject-verb agreement, and wrong prepositions.
      Step 4: Provide:
      - The original incorrect sentence.
      - The corrected sentence.
      - The grammar mistake.
      - The explanation of the mistake.
      - If no errors are found, return "Already correct".

      User's Essay:
      "${essayText}"`;

      const grammarResult = await model.generateContent(grammarPrompt);
      console.log("Raw AI Response:", grammarResult.response.text());

      // Parsing AI Response
      const responseText = grammarResult.response.text();
      const feedbackBlocks = responseText.split("\n\n").filter((block) => block.trim());

      const grammarFeedback = feedbackBlocks.map((block) => {
        const lines = block.split("\n").filter((line) => line.trim());
        if (lines.length < 2) return null; // Skip invalid blocks

        return {
          original: lines[0].replace("Original: ", "").trim(),
          corrected: lines[1].replace("Corrected: ", "").trim(),
          error: lines[2].replace("Error: ", "").trim(),
          explanation: lines[3].replace("Explanation: ", "").trim(),
        };
      }).filter(item => item !== null);

      console.log("Parsed Grammar Feedback:", grammarFeedback);

      res.json({
        "Status": "Success",
        isRelevant,
        topicFeedback: topicAnalysis,
        grammarAnalysis: grammarFeedback,
      });

    } catch (error) {
      console.error("Error analyzing essay:", error);
      res.status(500).json({ "Status": "Error", error: "Error analyzing essay" });
    }
  });
});



app.post("/translation/analyze", async (req, res) => {
  let token = req.headers.token;
  console.log(req.body)
  let { translationId, userTranslation } = req.body;
  

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!translationId || !userTranslation) {
      return res.status(400).json({ "Status": "Translation ID and user translation are required" });
    }

    try {
      // Fetch the original Malayalam text
      const translationDoc = await translateModel.findById(translationId); // Assume Translation model
      if (!translationDoc) {
        return res.status(404).json({ "Status": "Translation text not found" });
      }
      const originalMalayalam = translationDoc.text;

      // Step 1: Translate original Malayalam to English for comparison
      const translatePrompt = `Translate the following Malayalam text into English accurately:
      Input:
      ${originalMalayalam}`;
      const translateResult = await model.generateContent(translatePrompt);
      const aiEnglishTranslation = translateResult.response.text().trim();

      // Step 2: Check content relevance
      const relevancePrompt = `Compare the following two English texts to determine if they convey the same meaning or relate to the same topic:
      Text 1 (Reference): "${aiEnglishTranslation}"
      Text 2 (User): "${userTranslation}"
      Return "Relevant" if they are closely related in meaning or topic, or "Not Relevant" with a brief explanation if they differ significantly.`;
      const relevanceResult = await model.generateContent(relevancePrompt);
      const relevanceText = relevanceResult.response.text().trim();
      const isRelevant = relevanceText.startsWith("Relevant");
      const relevanceFeedback = isRelevant ? "Your translation relates well to the original text." : relevanceText;

      // Step 3: Grammar Analysis
      const grammarPrompt = `Analyze the grammar in the following English text. Split it into sentences and for each sentence, provide:
      - The corrected sentence
      - A detailed explanation of any errors or "No errors" if none, prefixed with "Error: "
      - How it should be corrected or "Already correct" if no changes, prefixed with "Correction: "
      Separate each sentence’s analysis with a blank line. Number each sentence (e.g., "1. Corrected text").
      Input:
      ${userTranslation.split(/(?<=\.|\?|\!)\s+/).map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      const grammarResult = await model.generateContent(grammarPrompt);
      const grammarText = grammarResult.response.text();
      const grammarBlocks = grammarText.split('\n\n').filter(block => block.trim());
      const grammarFeedback = userTranslation.split(/(?<=\.|\?|\!)\s+/).map((original, i) => {
        const block = grammarBlocks.find(b => b.startsWith(`${i + 1}.`)) || '';
        const lines = block.split('\n').filter(line => line.trim());
        const correctedLine = lines.find(line => line.startsWith(`${i + 1}.`)) || original;
        const errorLine = lines.find(line => line.startsWith('Error:')) || 'Error: No errors';
        const correctionLine = lines.find(line => line.startsWith('Correction:')) || 'Correction: Already correct';
        let corrected = correctedLine.replace(`${i + 1}. `, '').trim();
        const correctionText = correctionLine.replace('Correction: ', '').trim();
        if (correctionText !== 'Already correct' && correctionText.startsWith('Should be')) {
          corrected = correctionText.replace('Should be ', '').replace(/["']/g, '').trim();
        }
        return { original, corrected, error: errorLine.replace('Error: ', '').trim(), correction: correctionText };
      });

      // Step 4: Vocabulary Enhancement
      const vocabPrompt = `Enhance the vocabulary in the following English text. Split it into sentences and for each sentence, provide:
      - The enhanced sentence with one word replaced by a synonym or more suitable word (do not change tense or form)
      - The replaced word and its replacement, prefixed with "Replaced: "
      - A brief definition of the replacement word, prefixed with "Meaning: "
      Separate each sentence’s analysis with a blank line. Number each sentence (e.g., "1. Enhanced text"). If no enhancement, say "No enhancement needed".
      Input:
      ${userTranslation.split(/(?<=\.|\?|\!)\s+/).map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      const vocabResult = await model.generateContent(vocabPrompt);
      const vocabText = vocabResult.response.text();
      const vocabBlocks = vocabText.split('\n\n').filter(block => block.trim());
      const vocabFeedback = userTranslation.split(/(?<=\.|\?|\!)\s+/).map((original, i) => {
        const block = vocabBlocks.find(b => b.startsWith(`${i + 1}.`)) || '';
        const lines = block.split('\n').filter(line => line.trim());
        const enhancedLine = lines.find(line => line.startsWith(`${i + 1}.`)) || original;
        const replacedLine = lines.find(line => line.startsWith('Replaced:')) || 'Replaced: No enhancement needed';
        const meaningLine = lines.find(line => line.startsWith('Meaning:')) || 'Meaning: No enhancement needed';
        return {
          original,
          enhanced: enhancedLine.replace(`${i + 1}. `, '').trim(),
          replaced: replacedLine.replace('Replaced: ', '').trim(),
          meaning: meaningLine.replace('Meaning: ', '').trim(),
        };
      });

      // Step 5: Scoring
      let maxScore = 30; // 10 for relevance, 10 for grammar, 10 for vocabulary potential
      let userScore = 0;

      // Relevance score
      if (isRelevant) {
        userScore += 10;
      } else {
        feedback.push("Your translation does not relate to the original Malayalam text. Please write something relevant to the given topic.");
      }

      // Grammar score
      const grammarErrors = grammarFeedback.filter(f => f.error !== 'No errors').length;
      const grammarScore = Math.max(0, 10 - grammarErrors * 2); // Deduct 2 per error, min 0
      userScore += grammarScore;

      // Vocabulary score (bonus for potential enhancements)
      const vocabEnhancements = vocabFeedback.filter(f => f.replaced !== 'No enhancement needed').length;
      const vocabScore = Math.min(10, vocabEnhancements * 2); // 2 per enhancement, max 10
      userScore += vocabScore;

      res.json({
        "Status": "Success",
        score: {
          userScore,
          maxScore,
          details: { relevance: isRelevant ? 10 : 0, grammar: grammarScore, vocabulary: vocabScore },
        },
        relevanceFeedback,
        grammarFeedback,
        vocabFeedback,
      });
    } catch (error) {
      console.error("Translation analysis error:", error);
      res.status(500).json({ "Status": "Error", error: "Error analyzing translation" });
    }
  });
});

app.post("/analyze-error-correction", async (req, res) => {
  let token = req.headers.token;
  let { errorSentenceId, errorDescription, correctedText } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!errorSentenceId || !errorDescription || !correctedText) {
      return res.status(400).json({ "Status": "All fields are required" });
    }

    try {
      // Fetch the original error-filled sentence
      const errorSentence = await ErrorSentence.findById(errorSentenceId);
      if (!errorSentence) {
        return res.status(404).json({ "Status": "Error sentence not found" });
      }
      const originalText = errorSentence.text;

      // Updated AI prompt to analyze both original & user-corrected text
      const grammarPrompt = `Analyze the following:
      1️⃣ **Original Sentence (admin-added, may have errors):** "${originalText}"
      2️⃣ **User-Corrected Sentence:** "${correctedText}"

      Tasks:
      - Identify **all grammatical errors** in the original sentence.
      - Verify whether the user's correction is **completely accurate**.
      - If incorrect, provide the **corrected version**.
      - Score the user's correction **out of 10**, based on accuracy.
      - Explain mistakes in simple terms.

      Response format:
      - Errors Found: [List of mistakes]
      - Corrected Version: "Corrected sentence"
      - Score: X/10
      - Feedback: "Explain what was wrong and how to improve"`;

      const grammarResult = await model.generateContent(grammarPrompt);
      const aiResponse = grammarResult.response.text(); 

      // Extract AI feedback (parsing the response)
      let aiErrors = [];
      let aiCorrectedSentence = originalText;
      let userScore = 0;
      let feedback = [];

      // Extract errors, corrected version, and score from AI response
      const matchErrors = aiResponse.match(/Errors Found: \[(.*?)\]/);
      const matchCorrection = aiResponse.match(/Corrected Version: "(.*?)"/);
      const matchScore = aiResponse.match(/Score: (\d+)\/10/);
      const matchFeedback = aiResponse.match(/Feedback: "(.*?)"/);

      if (matchErrors) aiErrors = matchErrors[1].split(',').map(e => e.trim());
      if (matchCorrection) aiCorrectedSentence = matchCorrection[1];
      if (matchScore) userScore = parseInt(matchScore[1]);
      if (matchFeedback) feedback.push(matchFeedback[1]);

      res.json({
        "Status": "Success",
        score: {
          userScore,
          maxScore: 10,
        },
        feedback,
        aiAnalysis: aiErrors.length > 0 ? aiErrors : "No errors found",
        correctSentence: aiCorrectedSentence,
      });

    } catch (error) {
      console.error('Error analyzing correction:', error);
      res.status(500).json({ "Status": "Error", error: "Error analyzing correction" });
    }
  });
});

app.post("/grammar/check", async (req, res) => {
  let token = req.headers.token;
  let { text } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!text) {
      return res.status(400).json({ "Status": "Text is required" });
    }

    try {
      // Improved sentence splitting
      const sentences = text
        .replace(/"\s*(?=[A-Z])/g, '" ') // Add space after quotes before new sentences
        .split(/(?<=\.|\?|\!)\s+/)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());

      // Prompt Gemini with numbered sentences and detailed error explanations
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const prompt = `Analyze the grammar in the following numbered sentences. For each sentence, provide:
      - The corrected sentence (without the number)
      - A detailed explanation of any errors or "No errors" if none, prefixed with "Error: ". If there’s an error, explain what’s wrong, why it’s incorrect (e.g., grammar rule or context), and how it affects the sentence.
      - How it should be corrected or "Already correct" if no changes, prefixed with "Correction: "
      Separate each sentence’s analysis with a blank line. Include the original sentence number in the response (e.g., "1. Corrected text"). Example:
      1. He runs fast.
      Error: No errors
      Correction: Already correct

      2. She run fast.
      Error: Incorrect verb tense. The verb 'run' is in the present tense, but it should be 'runs' because the subject 'She' is third-person singular, requiring an -s ending in present tense. This mistake makes the sentence grammatically inconsistent.
      Correction: Should be "She runs fast."
      
      Input:
      ${numberedText}`;

      const result = await model.generateContent(prompt);
      console.log('Raw Gemini Response:', result.response.text()); // Debug raw response

      // Parse the response
      const responseText = result.response.text();
      const feedbackBlocks = responseText.split('\n\n').filter(block => block.trim());
      const feedback = sentences.map((original, i) => {
        const block = feedbackBlocks.find(b => b.startsWith(`${i + 1}.`)) || '';
        const lines = block.split('\n').filter(line => line.trim());
        const correctedLine = lines.find(line => line.startsWith(`${i + 1}.`)) || original;
        const errorLine = lines.find(line => line.startsWith('Error:')) || 'Error: No errors';
        const correctionLine = lines.find(line => line.startsWith('Correction:')) || 'Correction: Already correct';

        // Use the correction from "Correction:" line if it’s not "Already correct"
        let corrected = correctedLine.replace(`${i + 1}. `, '').trim();
        const correctionText = correctionLine.replace('Correction: ', '').trim();
        if (correctionText !== 'Already correct' && correctionText.startsWith('Should be')) {
          corrected = correctionText.replace('Should be ', '').replace(/["']/g, '').trim();
        }

        return {
          original,
          corrected,
          error: errorLine.replace('Error: ', '').trim(),
          correction: correctionText,
        };
      });

      console.log('Parsed Feedback:', feedback); // Debug parsed output
      res.json({
        "Status": "Success",
        feedback,
      });
    } catch (error) {
      console.error('Grammar check error:', error);
      res.status(500).json({ "Status": "Error", error: "Error checking grammar" });
    }
  });
});

app.post("/vocabulary/enhance", async (req, res) => {
  let token = req.headers.token;
  let { text } = req.body;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    if (!text) {
      return res.status(400).json({ "Status": "Text is required" });
    }

    try {
      // Split input text into sentences
      const sentences = text
        .replace(/"\s*(?=[A-Z])/g, '" ')
        .split(/(?<=\.|\?|\!)\s+/)
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());

      // Prompt Gemini for vocabulary enhancement and grammar correction
      const numberedText = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const prompt = `Enhance the vocabulary and correct grammar in the following numbered sentences, considering the context of the entire paragraph for a cohesive narrative. For each sentence:
      - Provide the enhanced sentence with improved vocabulary, replacing multiple words (as many as suitable) with synonyms or more precise words that fit the context. Do not change the tense or form of the replaced words (e.g., "send" stays a base verb, not "sent"). Correct any grammar mistakes.
      - List all replaced words and their replacements as a comma-separated string, prefixed with "Replaced: " (e.g., "Replaced: 'big' with 'enormous', 'fast' with 'swiftly'").
      - Provide brief definitions of all replacement words as a comma-separated string, prefixed with "Meanings: " (e.g., "Meanings: Enormous means very large, Swiftly means moving quickly").
      Separate each sentence’s analysis with a blank line. Use this format:
      **<number>.**
      Original: "<original sentence>"
      Enhanced: "<enhanced sentence>"
      Replaced: "<original word> with <new word>, <original word> with <new word>, ..."
      Meanings: "<definition of new word>, <definition of new word>, ..."

      If no enhancement or grammar correction is needed, say "No enhancement or correction needed" for Enhanced, Replaced, and Meanings fields.

      Input:
      ${numberedText}`;

      const result = await model.generateContent(prompt);
      console.log('Raw Gemini Response (Vocabulary):', result.response.text());

      // Parse the response
      const responseText = result.response.text();
      const feedbackBlocks = responseText.split('\n\n').filter(block => block.trim());
      const feedback = sentences.map((original, i) => {
        const block = feedbackBlocks.find(b => b.startsWith(`**${i + 1}.**`)) || '';
        const lines = block.split('\n').filter(line => line.trim());

        const originalLine = lines.find(line => line.startsWith('Original:')) || `Original: "${original}"`;
        const enhancedLine = lines.find(line => line.startsWith('Enhanced:')) || 'Enhanced: No enhancement or correction needed';
        const replacedLine = lines.find(line => line.startsWith('Replaced:')) || 'Replaced: No enhancement or correction needed';
        const meaningsLine = lines.find(line => line.startsWith('Meanings:')) || 'Meanings: No enhancement or correction needed';

        return {
          original: originalLine.replace('Original: "', '').replace('"', '').trim(),
          enhanced: enhancedLine.replace('Enhanced: ', '').trim(),
          replaced: replacedLine.replace('Replaced: ', '').trim(),
          meanings: meaningsLine.replace('Meanings: ', '').trim(),
        };
      });

      console.log('Parsed Feedback (Vocabulary):', JSON.stringify(feedback, null, 2));
      res.json({
        "Status": "Success",
        feedback,
      });
    } catch (error) {
      console.error('Vocabulary enhancement error:', error);
      res.status(500).json({ "Status": "Error", error: "Error enhancing vocabulary" });
    }
  });
});


app.post("/submit-essay", async (req, res) => {
  const { userId, topicId, essayText, attemptNumber = 1 } = req.body;

  if (!userId || !topicId || !essayText.trim()) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    // Find the topic details from EssayCategory
    const category = await EssayCategory.findOne({ "topics._id": topicId }, { "category": 1, "topics.$": 1 });

    if (!category || !category.topics.length) {
      return res.status(404).json({ error: "Topic not found." });
    }

    const topicDetails = category.topics[0]; // Extract topic info

    // Check if there's already a submission for this user and topic
    let essaySubmission = await EssaySubmission.findOne({
      userId,
      topicId
    });

    if (essaySubmission) {
      // If document exists, add a new attempt to the attempts array
      essaySubmission.attempts.push({
        attemptNumber: attemptNumber || essaySubmission.attempts.length + 1,
        essayText,
        submittedAt: new Date()
      });
    } else {
      // If document doesn't exist, create a new one with the first attempt
      essaySubmission = new EssaySubmission({
        userId,
        category: category.category,
        topicId,
        topic: topicDetails.question,
        attempts: [{
          attemptNumber: attemptNumber || 1,
          essayText,
          submittedAt: new Date()
        }]
      });
    }

    // Save the document
    await essaySubmission.save();
    
    // Return the complete document so frontend has access to all attempts
    res.status(200).json({ 
      status: "Success", 
      message: "Essay submitted successfully!", 
      data: essaySubmission 
    });

  } catch (error) {
    console.error("Error submitting essay:", error);
    res.status(500).json({ status: "Error", error: "Error submitting essay." });
  }
});

app.post("/update-essay", async (req, res) => {
  const { essaySubmissionId, userId, topicId, essayText, attemptNumber } = req.body;

  if (!userId || !topicId || !essayText.trim() || !essaySubmissionId) {
    return res.status(400).json({ status: "Error", error: "All fields are required." });
  }

  try {
    // Find the existing document
    let essaySubmission = await EssaySubmission.findById(essaySubmissionId);

    if (!essaySubmission) {
      return res.status(404).json({ status: "Error", error: "Essay submission not found." });
    }

    // Add the new attempt
    essaySubmission.attempts.push({
      attemptNumber: attemptNumber || essaySubmission.attempts.length + 1,
      essayText,
      submittedAt: new Date()
    });

    // Save the document
    await essaySubmission.save();
    
    // Return the complete document
    res.status(200).json({
      status: "Success",
      message: "Essay updated successfully with new attempt!",
      data: essaySubmission
    });
    
  } catch (error) {
    console.error("Error updating essay:", error);
    res.status(500).json({ status: "Error", error: "Error updating essay." });
  }
});

app.get("/essay-categories", async (req, res) => {
  try {
    const categories = await EssayCategory.find().select("category topics._id topics.question"); // ✅ Fetch topics with _id
    if (!categories || categories.length === 0) {
      return res.status(404).json({ message: "No categories found" });
    }
    res.json(categories);
  } catch (error) {
    console.error("Error fetching essay categories:", error);
    res.status(500).json({ error: "Error fetching essay categories" });
  }
});

app.get("/get-letters/:category", async (req, res) => {
  let token = req.headers.token;
  let { category } = req.params;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const letterCategory = await Letter.findOne({ category });

      if (!letterCategory) {
        return res.status(404).json({ message: "No letters found in this category" });
      }

      const formattedLetters = letterCategory.letters.map((letter) => ({
        letterId: letter._id, // ✅ Include letter ID for tracking
        description: letter.description,
      }));

      res.json({ category: letterCategory.category, letters: formattedLetters });
    } catch (error) {
      res.status(500).json({ error: "Error fetching letter writing tasks" });
    }
  });
});

app.post("/submit-letter", async (req, res) => {
  let token = req.headers.token;
  let { userId, letterId, answer } = req.body;

  if (!token || !userId) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const newLetterSubmission = new UserLetter({
        userId,
        letterId,
        answer,
      });

      await newLetterSubmission.save();
      res.json({ message: "Letter submitted successfully!" });
    } catch (error) {
      res.status(500).json({ error: "Error submitting letter" });
    }
  });
});

app.get("/random-error-sentence", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const count = await ErrorSentence.countDocuments();
      if (count === 0) {
        return res.status(404).json({ message: "No error sentences available" });
      }

      const randomIndex = Math.floor(Math.random() * count);
      const randomSentence = await ErrorSentence.findOne().skip(randomIndex);

      res.json(randomSentence);
    } catch (error) {
      res.status(500).json({ error: "Error fetching sentence" });
    }
  });
});

app.post("/submit-correction", async (req, res) => {
  let token = req.headers.token;
  let { userId, sentenceId, correctedSentence } = req.body;

  if (!token || !userId) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const newCorrection = new UserCorrection({
        userId,
        sentenceId,
        correctedSentence,
      });

      await newCorrection.save();
      res.json({ message: "Correction submitted successfully!" });
    } catch (error) {
      res.status(500).json({ error: "Error submitting correction" });
    }
  });
});

app.get("/random-story", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const count = await Story.countDocuments();
      if (count === 0) {
        return res.status(404).json({ message: "No story completion questions available" });
      }

      const randomIndex = Math.floor(Math.random() * count);
      const randomStory = await Story.findOne().skip(randomIndex);

      res.json(randomStory);
    } catch (error) {
      res.status(500).json({ error: "Error fetching story question" });
    }
  });
});

app.post("/submit-story", async (req, res) => {
  let token = req.headers.token;
  let { userId, storyId, completedStory, attemptNumber = 1 } = req.body;

  if (!token || !userId) {
    return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
    }

    try {
      // First check if this user has submitted this story before
      let userStory = await UserStoryModel.findOne({ userId, storyId });
      
      if (userStory) {
        // Check if this attempt number already exists
        const existingAttempt = userStory.attempts.find(
          attempt => attempt.attemptNumber === attemptNumber
        );
        
        if (existingAttempt) {
          // Update existing attempt
          existingAttempt.completedStory = completedStory;
          existingAttempt.submittedAt = new Date();
          // Reset scoring information if the story is modified
          existingAttempt.isScored = false;
          existingAttempt.score = null;
          existingAttempt.feedback = undefined;
        } else {
          // Add new attempt
          userStory.attempts.push({
            attemptNumber,
            completedStory,
            submittedAt: new Date()
          });
        }
        
        await userStory.save();
        
        res.json({ 
          "Status": "Success", 
          "message": `Story attempt #${attemptNumber} submitted successfully!`,
          "data": {
            userStoryId: userStory._id,
            attemptNumber
          }
        });
      } else {
        // Create new user story with first attempt
        const newUserStory = new UserStoryModel({
          userId,
          storyId,
          attempts: [{
            attemptNumber,
            completedStory,
            submittedAt: new Date()
          }]
        });

        await newUserStory.save();
        
        res.json({ 
          "Status": "Success", 
          "message": "Story submitted successfully!",
          "data": {
            userStoryId: newUserStory._id,
            attemptNumber
          }
        });
      }
    } catch (error) {
      console.error("Error submitting story:", error);
      res.status(500).json({ 
        "Status": "Error", 
        "message": "Error submitting story", 
        "error": error.message 
      });
    }
  });
});

app.get("/random-rephrase", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const count = await Rephrase.countDocuments();
      if (count === 0) {
        return res.status(404).json({ message: "No rephrase questions available" });
      }

      const randomIndex = Math.floor(Math.random() * count);
      const randomQuestion = await Rephrase.findOne().skip(randomIndex);

      res.json(randomQuestion);
      console.log(randomQuestion)
    } catch (error) {
      res.status(500).json({ error: "Error fetching rephrase question" });
    }
  });
});
app.post("/submit-rephrase", async (req, res) => {
  let token = req.headers.token;
  let { userId, rephraseId, rephrasedText, attemptNumber } = req.body;

  if (!token || !userId) {
    return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
    }

    try {
      // Check if a document already exists for this user and rephrase
      let userRephrase = await UserRephraseModel.findOne({
        userId,
        rephraseId
      });

      if (userRephrase) {
        // If document exists, add a new attempt to the attempts array
        userRephrase.attempts.push({
          attemptNumber: attemptNumber || userRephrase.attempts.length + 1,
          rephrasedText,
          submittedAt: new Date()
        });
      } else {
        // If document doesn't exist, create a new one with the first attempt
        userRephrase = new UserRephraseModel({
          userId,
          rephraseId,
          attempts: [{
            attemptNumber: attemptNumber || 1,
            rephrasedText,
            submittedAt: new Date()
          }]
        });
      }

      // Save the document
      await userRephrase.save();
      
      // Return the complete document so frontend has access to all attempts
      res.status(200).json(userRephrase);
    } catch (error) {
      console.error("Error submitting rephrased text:", error);
      res.status(500).json({ "Status": "Error", "message": "Error submitting rephrased text" });
    }
  });
});

app.post("/update-rephrase", async (req, res) => {
  let token = req.headers.token;
  let { userRephraseId, userId, rephraseId, rephrasedText, attemptNumber } = req.body;

  if (!token || !userId) {
    return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Error", "message": "Invalid Authentication" });
    }

    try {
      // Find the existing document
      let userRephrase = await UserRephraseModel.findById(userRephraseId);

      if (!userRephrase) {
        // If for some reason it doesn't exist, create it
        userRephrase = new UserRephraseModel({
          userId,
          rephraseId,
          attempts: []
        });
      }

      // Add the new attempt
      userRephrase.attempts.push({
        attemptNumber: attemptNumber || userRephrase.attempts.length + 1,
        rephrasedText,
        submittedAt: new Date()
      });

      await userRephrase.save();
      res.status(200).json(userRephrase);
    } catch (error) {
      console.error("Error updating rephrase:", error);
      res.status(500).json({ "Status": "Error", "message": "Error updating rephrased text" });
    }
  });
});

app.get("/random-image-question", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      const count = await ImageQuestion.countDocuments();
      if (count === 0) {
        return res.status(404).json({ message: "No images available" });
      }

      const randomIndex = Math.floor(Math.random() * count);
      const randomImage = await ImageQuestion.findOne().skip(randomIndex).select("_id question imageDescription imagePath"); // ✅ Ensure _id is selected

      if (!randomImage) {
        return res.status(404).json({ message: "No image found!" });
      }

      console.log("Sending image data:", randomImage); // ✅ Debugging to confirm _id is sent

      res.json({
        _id: randomImage._id,  // ✅ Now _id is included in response
        question: randomImage.question,
        imageDescription: randomImage.imageDescription,
        imagePath: randomImage.imagePath
      });
    } catch (error) {
      console.error("Error fetching image question:", error);
      res.status(500).json({ error: "Error fetching image question" });
    }
  });
});

app.post("/submit-description", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      console.log("Received data:", req.body);
      const { userId, imageId, description } = req.body;

      if (!userId || !imageId || !description) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const newResponse = new UserImage({ userId, imageId, description });
      await newResponse.save();

      res.json({ message: "Description submitted successfully!" });
    } catch (error) {
      res.status(500).json({ error: "Error submitting response" });
    }
  });
});

app.get("/get-translation", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
      return res.status(401).json({ status: "Unauthorized", message: "No token provided" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
      if (error || !decoded.email) {
          return res.status(403).json({ status: "Unauthorized", message: "Invalid token" });
      }

      try {
          const userId = req.headers.userid; // User ID from the frontend

          if (!userId) {
              return res.status(400).json({ status: "Error", message: "User ID is required" });
          }

          // ✅ Get all `TranslationText` IDs that the user has already translated
          const translatedTexts = await UserTranslationModel.find({ userId }).distinct("translationId");

          // ✅ Find an untranslated text for the user
          let selectedText;
          const remainingTexts = await translateModel.find({ _id: { $nin: translatedTexts } });

          if (remainingTexts.length > 0) {
              // Pick a random question the user hasn't translated yet
              const randomIndex = Math.floor(Math.random() * remainingTexts.length);
              selectedText = remainingTexts[randomIndex];
          } else {
              // If user has translated all texts, allow them to rewrite a random one
              const totalTexts = await translateModel.countDocuments();
              if (totalTexts === 0) {
                  return res.json({ message: "No translation texts available" });
              }

              const randomIndex = Math.floor(Math.random() * totalTexts);
              selectedText = await translateModel.findOne().skip(randomIndex);
          }

          res.json({ status: "Success", translation: selectedText });

      } catch (error) {
          res.status(500).json({ status: "Error", message: "Error fetching translation", error });
      }
  });
});

app.post("/submit-translation", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
      return res.status(401).json({ status: "Unauthorized", message: "No token provided" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
      if (error || !decoded.email) {
          return res.status(403).json({ status: "Unauthorized", message: "Invalid token" });
      }

      try {
          const { userId, translationId, userTranslation, attemptNumber = 1 } = req.body;

          if (!userId || !translationId || !userTranslation.trim()) {
              return res.status(400).json({ status: "Error", message: "All fields are required" });
          }

          // Check if the translationId exists in `TranslationText`
          const originalText = await translateModel.findById(translationId);
          if (!originalText) {
              return res.status(404).json({ status: "Error", message: "Original text not found" });
          }

          // Check if a document already exists for this user and translation
          let userTranslationDoc = await UserTranslationModel.findOne({
              userId,
              translationId
          });

          if (userTranslationDoc) {
              // If document exists, add a new attempt to the attempts array
              userTranslationDoc.attempts.push({
                  attemptNumber: attemptNumber || userTranslationDoc.attempts.length + 1,
                  translatedText: userTranslation,
                  submittedAt: new Date()
              });
          } else {
              // If document doesn't exist, create a new one with the first attempt
              userTranslationDoc = new UserTranslationModel({
                  userId,
                  translationId,
                  attempts: [{
                      attemptNumber: attemptNumber || 1,
                      translatedText: userTranslation,
                      submittedAt: new Date()
                  }]
              });
          }

          // Save the document
          await userTranslationDoc.save();
          
          // Return the complete document so frontend has access to all attempts
          res.status(200).json(userTranslationDoc);
          
      } catch (error) {
          console.error("Error submitting translation:", error);
          res.status(500).json({ status: "Error", message: "Error saving translation", error });
      }
  });
});

app.post("/update-translation", async (req, res) => {
  let token = req.headers.token;

  if (!token) {
      return res.status(401).json({ status: "Unauthorized", message: "No token provided" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
      if (error || !decoded.email) {
          return res.status(403).json({ status: "Unauthorized", message: "Invalid token" });
      }

      try {
          const { userTranslationId, userId, translationId, userTranslation, attemptNumber } = req.body;

          if (!userId || !translationId || !userTranslation.trim() || !userTranslationId) {
              return res.status(400).json({ status: "Error", message: "All fields are required" });
          }

          // Find the existing document
          let userTranslationDoc = await UserTranslationModel.findById(userTranslationId);

          if (!userTranslationDoc) {
              // If for some reason it doesn't exist, create it
              userTranslationDoc = new UserTranslationModel({
                  userId,
                  translationId,
                  attempts: []
              });
          }

          // Add the new attempt
          userTranslationDoc.attempts.push({
              attemptNumber: attemptNumber || userTranslationDoc.attempts.length + 1,
              translatedText: userTranslation,
              submittedAt: new Date()
          });

          // Save the document
          await userTranslationDoc.save();
          
          // Return the complete document
          res.status(200).json(userTranslationDoc);
          
      } catch (error) {
          console.error("Error updating translation:", error);
          res.status(500).json({ status: "Error", message: "Error updating translation", error });
      }
  });
});

app.post("/diary", async (req, res) => {
  let token = req.headers.token;
  let { userid, date, prompts, gratitude, goals, improvement, narrative } = req.body;

  if (!token || !userid) {
    return res.status(401).json({ "Status": "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.status(401).json({ "Status": "Invalid Authentication" });
    }

    try {
      // ✅ Ensure prompts are formatted correctly (Array of objects with promptId & response)
      if (!Array.isArray(prompts) || prompts.some(p => !p.promptId || !p.response)) {
        return res.status(400).json({ "Status": "Error", "Message": "Invalid prompt format" });
      }

      let diaryEntry = await Diary.findOne({ userId: userid, date });

      if (diaryEntry) {
        // ✅ Update existing diary entry
        diaryEntry.prompts = prompts; // [{ promptId, response }, { promptId, response }, ...]
        diaryEntry.gratitude = gratitude;
        diaryEntry.goals = goals;
        diaryEntry.improvement = improvement;
        diaryEntry.narrative = narrative;
        await diaryEntry.save();
      } else {
        // ✅ Create a new diary entry
        diaryEntry = new Diary({
          userId: userid,
          date,
          prompts, // Array of prompt objects
          gratitude,
          goals,
          improvement,
          narrative
        });
        await diaryEntry.save();
      }

      res.json({ "Status": "Success", "Message": "Diary Entry Saved Successfully" });

    } catch (error) {
      console.error("Error saving diary entry:", error);
      res.status(500).json({ "Status": "Error", "Message": "Error Saving Diary Entry", "Error": error.message });
    }
  });
});

app.get("/diary/:userid/:date", async (req, res) => {
  let token = req.headers.token;
  let { userid, date } = req.params;

  if (!token || !userid) {
    return res.json({ Status: "Invalid Authentication" });
  }

  jwt.verify(token, "usertoken", async (error, decoded) => {
    if (error || !decoded || !decoded.email) {
      return res.json({ Status: "Invalid Authentication" });
    }

    try {
      // ✅ Find the diary entry for the user on the given date
      const diaryEntry = await Diary.findOne({ userId: userid, date }).populate("prompts.promptId");

      if (!diaryEntry) {
        return res.json({ Status: "No Entry Found" });
      }

      // ✅ Format prompts to return ID & question along with the user's responses
      const formattedPrompts = diaryEntry.prompts.map((p) => ({
        promptId: p.promptId._id,
        question: p.promptId.question,
        response: p.response,
      }));

      // ✅ Send the updated diary entry response
      res.json({
        ...diaryEntry.toObject(),
        prompts: formattedPrompts, // Replacing prompts with formatted data
      });

    } catch (error) {
      console.error("Error fetching diary entry:", error);
      res.json({ Status: "Error Fetching Diary Entry", Error: error.message });
    }
  });
});

app.post("/admin/add-letter-category", async (req, res) => {
    try {
      const { category } = req.body;
      if (!category) {
        return res.status(400).json({ message: "Category name is required" });
      }
  
      const newCategory = new Letter({ category, letters: [] });
      await newCategory.save();
  
      res.status(201).json({ message: "Category added successfully", newCategory });
    } catch (error) {
      res.status(500).json({ message: "Error adding category", error });
    }
  });

app.post("/admin/add-letter", async (req, res) => {
    try {
      const { category, description } = req.body;
      if (!category || !description) {
        return res.status(400).json({ message: "Category and description are required" });
      }
  
      const categoryExists = await Letter.findOne({ category });
      if (!categoryExists) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      categoryExists.letters.push({ description });
      await categoryExists.save();
  
      res.status(201).json({ message: "Letter description added successfully", categoryExists });
    } catch (error) {
      res.status(500).json({ message: "Error adding letter description", error });
    }
  });  

app.get("/letter-categories", async (req, res) => {
    try {
      const categories = await Letter.find().select("category");
      res.status(200).json(categories);
    } catch (error) {
      res.status(500).json({ message: "Error fetching categories", error });
    }
  });  

app.get("/letters/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const categoryData = await Letter.findOne({ category });
  
      if (!categoryData) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      res.status(200).json({ letters: categoryData.letters });
    } catch (error) {
      res.status(500).json({ message: "Error fetching letters", error });
    }
  });  

app.delete("/admin/delete-letter-category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const deletedCategory = await Letter.findOneAndDelete({ category });
  
      if (!deletedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting category", error });
    }
  });  
  
app.delete("/admin/delete-letter", async (req, res) => {
    try {
      const { category, description } = req.body;
      const categoryExists = await Letter.findOne({ category });
  
      if (!categoryExists) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      categoryExists.letters = categoryExists.letters.filter((letter) => letter.description !== description);
      await categoryExists.save();
  
      res.status(200).json({ message: "Letter description deleted successfully", categoryExists });
    } catch (error) {
      res.status(500).json({ message: "Error deleting letter description", error });
    }
  });  

app.post("/admin/add-error-sentence", async (req, res) => {
    try {
      const { sentence } = req.body;
      if (!sentence) {
        return res.status(400).json({ message: "Sentence is required" });
      }
  
      const newErrorSentence = new ErrorSentence({ sentence });
      await newErrorSentence.save();
  
      res.status(201).json({ message: "Sentence added successfully", newErrorSentence });
    } catch (error) {
      res.status(500).json({ message: "Error adding sentence", error });
    }
  });

app.get("/error-sentences", async (req, res) => {
    try {
      const sentences = await ErrorSentence.find().sort({ createdAt: -1 }); // Fetch in descending order
      res.status(200).json(sentences);
    } catch (error) {
      res.status(500).json({ message: "Error fetching sentences", error });
    }
  }); 
  
app.delete("/admin/delete-error-sentence/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deletedSentence = await ErrorSentence.findByIdAndDelete(id);
  
      if (!deletedSentence) {
        return res.status(404).json({ message: "Sentence not found" });
      }
  
      res.status(200).json({ message: "Sentence deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting sentence", error });
    }
  });  

app.post("/admin/add-story", async (req, res) => {
    try {
      const { title, storyText } = req.body;
      if (!title || !storyText) {
        return res.status(400).json({ message: "Title and story text are required" });
      }
  
      const newStory = new Story({ title, storyText });
      await newStory.save();
  
      res.status(201).json({ message: "Story added successfully", newStory });
    } catch (error) {
      res.status(500).json({ message: "Error adding story", error });
    }
  });

app.get("/stories", async (req, res) => {
    try {
      const stories = await Story.find().sort({ createdAt: -1 }); // Fetch in descending order
      res.status(200).json(stories);
    } catch (error) {
      res.status(500).json({ message: "Error fetching stories", error });
    }
  });  
  
app.delete("/admin/delete-story/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deletedStory = await Story.findByIdAndDelete(id);
  
      if (!deletedStory) {
        return res.status(404).json({ message: "Story not found" });
      }
  
      res.status(200).json({ message: "Story deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting story", error });
    }
  });  

app.post("/admin/add-rephrase", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
  
      const newRephrase = new Rephrase({ text });
      await newRephrase.save();
  
      res.status(201).json({ message: "Paragraph added successfully", newRephrase });
    } catch (error) {
      res.status(500).json({ message: "Error adding paragraph", error });
    }
  });

app.get("/rephrase-texts", async (req, res) => {
    try {
      const texts = await Rephrase.find().sort({ createdAt: -1 }); // Fetch in descending order
      res.status(200).json(texts);
    } catch (error) {
      res.status(500).json({ message: "Error fetching paragraphs", error });
    }
  });  

app.delete("/admin/delete-rephrase/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deletedText = await Rephrase.findByIdAndDelete(id);
  
      if (!deletedText) {
        return res.status(404).json({ message: "Paragraph not found" });
      }
  
      res.status(200).json({ message: "Paragraph deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting paragraph", error });
    }
  });  

app.post("/admin/add-essay-category", async (req, res) => {
    try {
      const { category } = req.body;
      if (!category) {
        return res.status(400).json({ message: "Category name is required" });
      }
      
      const newCategory = new EssayCategory({ category, topics: [] });
      await newCategory.save();
      
      res.status(201).json({ message: "Category added successfully", newCategory });
    } catch (error) {
      res.status(500).json({ message: "Error adding category", error });
    }
  });

  app.post("/admin/add-topic", async (req, res) => {
    try {
      
      const { category, question } = req.body;
      console.log(category)
      console.log(question)
  
      if (!category || !question) {
        return res.status(400).json({ message: "Category and question are required" });
      }
  
      // ✅ Find the category
      const categoryExists = await EssayCategory.findOne({ category });
  
      if (!categoryExists) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      // ✅ Push topic as an object instead of a string
      categoryExists.topics.push({ question });
  
      await categoryExists.save();
  
      res.status(201).json({ message: "Topic added successfully", category: categoryExists });
    } catch (error) {
      console.error("Error adding topic:", error);
      res.status(500).json({ message: "Error adding topic", error });
    }
  });
   
app.get("/categories", async (req, res) => {
    try {
      const categories = await EssayCategory.find().select("category");
      res.status(200).json(categories);
    } catch (error) {
      res.status(500).json({ message: "Error fetching categories", error });
    }
  });
  
app.get("/topics/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const categoryData = await EssayCategory.findOne({ category });
  
      if (!categoryData) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      res.status(200).json({ topics: categoryData.topics });
    } catch (error) {
      res.status(500).json({ message: "Error fetching topics", error });
    }
  });  

app.delete("/admin/delete-category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const deletedCategory = await EssayCategory.findOneAndDelete({ category });
  
      if (!deletedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting category", error });
    }
  });  

app.delete("/admin/delete-topic", async (req, res) => {
    try {
      const { category, topic } = req.body;
      const categoryExists = await EssayCategory.findOne({ category });
  
      if (!categoryExists) {
        return res.status(404).json({ message: "Category not found" });
      }
  
      categoryExists.topics = categoryExists.topics.filter(t => t !== topic);
      await categoryExists.save();
  
      res.status(200).json({ message: "Topic deleted successfully", categoryExists });
    } catch (error) {
      res.status(500).json({ message: "Error deleting topic", error });
    }
  });  

  app.post("/upload", upload.single("image"), async (req, res) => {
    try {
        const { question, imageDescription } = req.body; // Accept image description

        if (!question || !imageDescription || !req.file) {
            return res.status(400).json({ message: "Question, image, and description are required" });
        }

        const newEntry = new ImageQuestion({
            question,
            imageDescription, // Store the admin-provided description
            imagePath: `/uploads/${req.file.filename}` // Relative image path for frontend
        });

        await newEntry.save();
        res.status(201).json({ message: "Question uploaded successfully", data: newEntry });

    } catch (error) {
        console.error("Error uploading question:", error);
        res.status(500).json({ message: "Error uploading question", error });
    }
});

app.get("/all-questions", async (req, res) => {
    try {
      const questions = await ImageQuestion.find().sort({ createdAt: -1 });
      res.status(200).json(questions);
    } catch (error) {
      res.status(500).json({ message: "Error fetching questions", error });
    }
}); 

app.delete("/delete/:id", async (req, res) => {
    try {
      const question = await ImageQuestion.findById(req.params.id);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
  
      // Delete the image file from the server
      const imagePath = path.join(__dirname, "../", question.imagePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
  
      await ImageQuestion.findByIdAndDelete(req.params.id);
      res.status(200).json({ message: "Question deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting question", error });
    }
  });  
 
app.post("/api/admin/add-translate-text", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      const newText = new translateModel({ text });
      await newText.save();
      res.status(201).json({ message: "Text added successfully", newText });
    } catch (error) {
      res.status(500).json({ message: "Error adding text", error });
    }
  });

app.get("/api/admin/translate-texts", async (req, res) => {
    try {
      const texts = await translateModel.find();
      res.json(texts);
    } catch (error) {
      res.status(500).json({ message: "Error fetching texts", error });
    }
  });

app.delete("/api/admin/delete-translate-text/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deletedText = await translateModel.findByIdAndDelete(id);
      if (!deletedText) {
        return res.status(404).json({ message: "Text not found" });
      }
      res.json({ message: "Text deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting text", error });
    }
  });  
  
app.post("/adminSignIn", async(req, res)=>{
    let admincred = req.body
    adminModel.find({}).then(
        (item) => {
            if (admincred.username != item[0].username) {
                res.json({"Status":"Invalid Username"})
            }
            else{
            let passwordValidator = bcrypt.compareSync(admincred.password,item[0].password)
            if (passwordValidator) {
                jwt.sign({username:admincred.username},"Admintoken",{expiresIn:"1d"},(error, token) => {
                    if (error) {
                        res.json({"Status":"Error", "Error":error})
                    }
                    else {
                        console.log(admincred)
                        res.json({"Status":"Success","token":token,"UserId":item[0]._id})
                    }

                    
                })}
                else{
                    res.json({"Status":"Incorrect Password"})
                }
            }
        }
                
                
            
            
        
    )
})

app.post("/adminSignUp", async(req, res) =>{
    let admindata = req.body
    let hashedPwd = bcrypt.hashSync(admindata.password,10)
    admindata.password = hashedPwd
    adminModel.find({}).then(
        (item) =>{
            if(item.length == 0) {
                let admin = new adminModel(admindata)
                admin.save()
                res.json({"Status":"Success"})
            }
            else {
                res.json({"Error":"Admin already registered"})
            }  
        }
    )
})

app.post("/login", async(req, res) => {
    let user = req.body
    userModel.find({email:user.email}).then(
        (detail) => {
            if (detail.length == 0) {
                res.json({"Status":"invalid Emailid"})
                
            } else {
                let passcheck = bcrypt.compareSync(user.password,detail[0].password)
                if (passcheck) {
                    jwt.sign({email:user.email},"usertoken",{expiresIn:"1d"},(error, token) => {
                        if (error) {
                            res.json({"Status":"Error","Error":error})
                        }
                        else {
                            res.json({"Status":"Success","token":token,"userid":detail[0]._id,"name":detail[0].name})
                        }
                    })
                    
                } else {
                    res.json({"Status":"Incorrect Password"})
                }
            }
        }
    )
})

app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
        return res.status(400).json({ Error: 'Missing required fields' });
    }

    try {
        // Check if email already exists
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ Error: 'Email already exists' });
        }

        // Hash the password
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Create and save the new user
        const user = new userModel({
            name,
            email,
            password: hashedPassword
        });
        await user.save();

        res.status(201).json({ Status: 'Success' });
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error
            return res.status(400).json({ Error: 'Email already exists' });
        }
        console.error(err);
        res.status(500).json({ Error: 'Failed to save user' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

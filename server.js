// server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Initialize Gemini API securely
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ Warning: GEMINI_API_KEY not found in environment variables");
}

// ✅ Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files (optional for testing locally)
app.use(express.static(path.join(__dirname, "public")));

// ✅ Configure file uploads folder
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const unique = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("❌ Only PDF, DOC, or DOCX files are allowed"));
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// ✅ Extract text from resume
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const data = await pdf(fs.readFileSync(filePath));
    return data.text;
  } else {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
}

// ✅ Analyze resume using Gemini
async function analyzeResume(text, jobDescription) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
Analyze this resume and return a JSON response evaluating:
- ATS compatibility
- Skill relevance
- Experience level
- Formatting
- Match with job description (if provided)

Resume:
${text}

Job Description:
${jobDescription || "N/A"}

Return ONLY JSON with this format:
{
  "overallScore": number,
  "atsScore": number,
  "skillsScore": number,
  "experienceScore": number,
  "formatScore": number,
  "strengths": ["string"],
  "improvements": ["string"],
  "suggestions": ["string"]
}`;

    const result = await model.generateContent(prompt);
    const output = result.response.text();

    const json = output.match(/\{[\s\S]*\}/);
    if (!json) throw new Error("Invalid response from Gemini");
    return JSON.parse(json[0]);
  } catch (err) {
    console.error("Gemini error:", err.message);
    throw new Error("Failed to analyze resume");
  }
}

// ✅ POST endpoint for resume analysis
app.post("/analyze-resume", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;
    const jobDescription = req.body.jobDescription || "";

    const text = await extractText(filePath);
    const analysis = await analyzeResume(text, jobDescription);

    // ✅ Clean up file
    fs.unlink(filePath, () => {});

    res.json({
      success: true,
      message: "Resume analyzed successfully",
      data: analysis,
    });
  } catch (error) {
    console.error("Error in /analyze-resume:", error);
    res.status(500).json({ error: error.message || "Server error" });
  }
});

// ✅ Health check endpoint
app.get("/", (req, res) => {
  res.send("✅ Resume Analyzer Backend is running successfully.");
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});


const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyDIW0j1ZGnkGD0zNfOtaGGoJP7Br9gWGmg');

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Extract text from uploaded file
async function extractText(filePath, fileType) {
  try {
    if (fileType === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } else if (fileType === '.doc' || fileType === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    }
  } catch (error) {
    throw new Error('Failed to extract text from file');
  }
}

// Score resume using Gemini API
async function scoreResume(resumeText, jobDescription = '') {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `
    Analyze this resume and provide a comprehensive score out of 100. Consider:
    - ATS compatibility and keyword optimization
    - Professional formatting and structure
    - Relevant skills and experience
    - Education and certifications
    - Overall presentation quality
    ${jobDescription ? `- Match with job description: ${jobDescription}` : ''}
    
    Resume content:
    ${resumeText}
    
    Provide response in JSON format:
    {
      "overallScore": number,
      "atsScore": number,
      "skillsScore": number,
      "experienceScore": number,
      "formatScore": number,
      "suggestions": ["suggestion1", "suggestion2", "suggestion3"],
      "strengths": ["strength1", "strength2"],
      "improvements": ["improvement1", "improvement2"]
    }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error('Failed to score resume');
  }
}

// Upload and analyze resume endpoint
app.post('/analyze-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileType = path.extname(req.file.originalname).toLowerCase();
    const jobDescription = req.body.jobDescription || '';

    // Extract text from file
    const resumeText = await extractText(filePath, fileType);
    
    // Score resume using Gemini
    const score = await scoreResume(resumeText, jobDescription);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      filename: req.file.originalname,
      score: score
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze resume',
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

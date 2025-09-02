from fastapi import FastAPI, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import docx2txt
import PyPDF2

app = FastAPI()

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace * with your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- File Upload Endpoint ---
@app.post("/api/upload")
async def upload_resume(file: UploadFile = File(...)):
    content = ""

    if file.filename.endswith(".pdf"):
        reader = PyPDF2.PdfReader(file.file)
        for page in reader.pages:
            if page.extract_text():
                content += page.extract_text() + "\n"

    elif file.filename.endswith(".docx"):
        content = docx2txt.process(file.file)

    elif file.filename.endswith(".txt"):
        content = (await file.read()).decode("utf-8")

    else:
        return {"error": "Unsupported file type"}

    return {"text": content.strip()}


# --- Resume Scoring Endpoint ---
@app.post("/api/score")
async def score_resume(request: Request):
    data = await request.json()
    resume_text = data.get("text", "")

    # --- Dummy scoring logic ---
    score = 70
    feedback = []

    words = len(resume_text.split())
    if words < 150:
        score -= 10
        feedback.append("Too short. Aim for at least 1 page (~300 words).")
    elif words > 800:
        score -= 10
        feedback.append("Too long. Keep it under 2 pages.")

    sections = ["education", "experience", "skills", "projects"]
    for section in sections:
        if section not in resume_text.lower():
            score -= 5
            feedback.append(f"Missing '{section.title()}' section.")

    if "python" in resume_text.lower():
        score += 5
    else:
        feedback.append("Add more technical skills (e.g., Python, SQL).")

    score = max(0, min(100, score))

    if not feedback:
        feedback.append("Looks good! Fine-tune formatting for better readability.")

    return {"score": score, "feedback": feedback}

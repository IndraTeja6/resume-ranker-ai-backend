from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS so frontend can call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In prod, replace * with your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline

# Initialize the FastAPI app
app = FastAPI()

# --- CORS Middleware ---
# This allows your Netlify frontend to communicate with this server
origins = ["*"]  # You can restrict this to your Netlify URL for better security
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Load the AI Model ---
# This loads a small, multilingual model fine-tuned for sentiment analysis.
# It will be downloaded automatically the first time the server starts.
print("Loading sentiment analysis model...")
sentiment_pipeline = pipeline(
    "sentiment-analysis",
    model="lxyuan/distilbert-base-multilingual-cased-sentiments-student",
)
print("Model loaded successfully.")


# --- Define the data model for the request ---
class TextToAnalyze(BaseModel):
    text: str


# --- Create the API Endpoint ---
@app.post("/analyze")
def analyze_text(data: TextToAnalyze):
    # Run the text through the model's pipeline
    result = sentiment_pipeline(data.text)[0]
    label = result["label"]
    score = result["score"]

    # Convert the model's output ('positive', 'neutral', 'negative') to our reactivity score (0.0 - 1.0)
    reactivity_score = 0.5  # Default to neutral
    if label == "positive":
        reactivity_score = 1.0 - score  # High positive score = low reactivity
    elif label == "negative":
        reactivity_score = score  # High negative score = high reactivity

    # Simple logic for triggers (can be expanded)
    triggers = []
    if reactivity_score > 0.6 and "you" in data.text.lower():
        triggers.append("accusation")

    return {"reactive_score": reactivity_score, "triggers": triggers}


# To run this server locally: open a terminal and run `uvicorn main:app --reload`

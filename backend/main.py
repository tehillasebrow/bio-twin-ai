import os
import json
import time
import base64
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from sqlmodel import Session, select
from contextlib import asynccontextmanager

# Google GenAI modern SDK imports
from google import genai
from google.genai import types

# Your local database imports
from database import create_db_and_tables, get_session, User, Meal, Workout

# 1. Database Startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# 2. AI Configuration
load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

# Using the high-performance model with the 500-request quota
MODEL_ID = "gemini-3.1-flash-lite-preview"

# 3. Updated Pydantic Schema (Now accepts an optional image)
class MealTextInput(BaseModel):
    user_id: int
    description: str
    image_base64: Optional[str] = None  # NEW: Allows frontend to send photo data

# 4. CORS Security Policy
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000"
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AI ENDPOINTS ---
@app.post("/ai/log-meal/", response_model=Meal)
def ai_log_meal(input_data: MealTextInput, session: Session = Depends(get_session)):
    max_retries = 3
    
    # Prepare the prompt instructions
    prompt_text = (
        f"Analyze this meal: '{input_data.description}'. "
        "Return ONLY a JSON object with these keys: "
        "calories (int), protein_g (float), carbs_g (float), fat_g (float). "
        "No markdown, no explanations, no backticks."
    )
    
    # Prepare the payload list for the new SDK
    contents = [prompt_text]
    
    # If an image was uploaded, decode it and attach it to the prompt
    if input_data.image_base64:
        try:
            image_bytes = base64.b64decode(input_data.image_base64)
            contents.append(
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type='image/jpeg' 
                )
            )
        except Exception as e:
            print(f"Image decode error: {e}")
            raise HTTPException(status_code=400, detail="Invalid image base64 data")

    # Start the Retry Loop (Your Week 4 Resilience Architecture)
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=MODEL_ID,
                contents=contents
            )
            
            text_content = response.text.strip()
            
            # Clean AI response logic (Markdown Stripper)
            if "```json" in text_content:
                text_content = text_content.split("```json")[1].split("```")[0].strip()
            elif "```" in text_content:
                text_content = text_content.split("```")[1].split("```")[0].strip()

            ai_output = json.loads(text_content)
            
            # Save to Database
            new_meal = Meal(
                user_id=input_data.user_id,
                description=input_data.description,
                calories=int(ai_output.get("calories", 0)),
                protein_g=float(ai_output.get("protein_g", 0.0)),
                carbs_g=float(ai_output.get("carbs_g", 0.0)),
                fat_g=float(ai_output.get("fat_g", 0.0))
            )
            
            session.add(new_meal)
            session.commit()
            session.refresh(new_meal)
            return new_meal

        except Exception as e:
            # Handle Quota/Rate Limits
            if "429" in str(e) and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 5
                print(f"Rate limit hit. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            print(f"!!! AI CRASH ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# --- STANDARD ENDPOINTS (Meals) ---
@app.post("/meals/", response_model=Meal)
def create_meal(meal: Meal, session: Session = Depends(get_session)):
    session.add(meal)
    session.commit()
    session.refresh(meal)
    return meal

@app.get("/meals/", response_model=list[Meal])
def read_meals(session: Session = Depends(get_session)):
    return session.exec(select(Meal)).all()

@app.delete("/meals/{meal_id}")
def delete_meal(meal_id: int, session: Session = Depends(get_session)):
    meal = session.get(Meal, meal_id)
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")
    session.delete(meal)
    session.commit()
    return {"ok": True}


# --- STANDARD ENDPOINTS (Workouts) ---
@app.post("/workouts/", response_model=Workout)
def create_workout(workout: Workout, session: Session = Depends(get_session)):
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout

@app.get("/workouts/", response_model=list[Workout])
def read_workouts(session: Session = Depends(get_session)):
    return session.exec(select(Workout)).all()

@app.delete("/workouts/{workout_id}")
def delete_workout(workout_id: int, session: Session = Depends(get_session)):
    workout = session.get(Workout, workout_id)
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    session.delete(workout)
    session.commit()
    return {"ok": True}
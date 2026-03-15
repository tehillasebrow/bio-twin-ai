import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from contextlib import asynccontextmanager
from database import create_db_and_tables, get_session, User, Meal, Workout

# 1. Database Startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# 2. AI Configuration
load_dotenv()
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel('gemini-1.5-flash')

# A schema to receive the text from the frontend
class MealTextInput(BaseModel):
    user_id: int
    description: str

# 3. CORS Security Policy (CRUCIAL FIX HERE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MEAL ENDPOINTS ---
@app.post("/meals/", response_model=Meal)
def create_meal(meal: Meal, session: Session = Depends(get_session)):
    session.add(meal)
    session.commit()
    session.refresh(meal)
    return meal

@app.get("/meals/", response_model=list[Meal])
def read_meals(session: Session = Depends(get_session)):
    meals = session.exec(select(Meal)).all()
    return meals

# --- AI ENDPOINTS ---
@app.post("/ai/log-meal/", response_model=Meal)
def ai_log_meal(input_data: MealTextInput, session: Session = Depends(get_session)):
    # 1. Give the AI strict instructions
    prompt = f"""
    Analyze this meal description: "{input_data.description}"
    Estimate the nutritional content.
    You MUST return ONLY a raw JSON object with exactly these keys:
    "calories" (integer), "protein_g" (float), "carbs_g" (float), "fat_g" (float).
    Do not include markdown formatting, backticks, or any other text.
    """
    
    # 2. Ask Gemini for the data
    response = model.generate_content(prompt)
    
    # 3. Clean up the response in case the AI added formatting, then parse it
    clean_text = response.text.replace('```json', '').replace('```', '').strip()
    ai_output = json.loads(clean_text)
    
    # 4. Save the AI's calculations to your database
    new_meal = Meal(
        user_id=input_data.user_id,
        description=input_data.description,
        calories=ai_output["calories"],
        protein_g=ai_output["protein_g"],
        carbs_g=ai_output["carbs_g"],
        fat_g=ai_output["fat_g"]
    )
    
    session.add(new_meal)
    session.commit()
    session.refresh(new_meal)
    
    return new_meal

# --- WORKOUT ENDPOINTS ---
@app.post("/workouts/", response_model=Workout)
def create_workout(workout: Workout, session: Session = Depends(get_session)):
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout

@app.get("/workouts/", response_model=list[Workout])
def read_workouts(session: Session = Depends(get_session)):
    workouts = session.exec(select(Workout)).all()
    return workouts
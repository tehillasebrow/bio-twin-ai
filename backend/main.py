import os
import json
import base64
from datetime import datetime
from typing import Optional, List
import requests

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from sqlmodel import Session, select, Field, SQLModel
from contextlib import asynccontextmanager

from google import genai
from google.genai import types

# --- RESTORED & UPDATED MODELS ---
class Meal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    description: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    image_data: Optional[str] = None 
    date_logged: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    items_json: Optional[str] = None # Detailed breakdown

class Workout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    type: str
    duration_minutes: int
    calories_burned: int
    date_logged: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))

from database import create_db_and_tables, get_session

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)
load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- TRUTH ENGINE UTILITY ---
def get_usda_data(query: str):
    api_key = os.environ.get("USDA_API_KEY", "DEMO_KEY")
    url = f"https://api.nal.usda.gov/fdc/v1/foods/search?api_key={api_key}&query={query}&pageSize=1"
    try:
        res = requests.get(url).json()
        if res.get("foods"):
            food = res["foods"][0]
            macros = {"calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "name": food.get("description")}
            for n in food.get("foodNutrients", []):
                name = n.get("nutrientName", "").lower()
                val = n.get("value", 0.0)
                if "energy" in name and "kcal" in n.get("unitName", "").lower(): macros["calories"] = int(val)
                elif "protein" in name: macros["protein"] = val
                elif "carbohydrate" in name: macros["carbs"] = val
                elif "total lipid (fat)" in name: macros["fat"] = val
            return macros
    except: pass
    return None

class MealTextInput(BaseModel):
    user_id: int
    description: str
    image_base64: Optional[str] = None

@app.post("/ai/log-meal/", response_model=Meal)
def ai_log_meal(input_data: MealTextInput, session: Session = Depends(get_session)):
    prompt = f"Analyze this meal: {input_data.description}. Return JSON: {{'items': [{{'name', 'quantity', 'calories'}}], 'total_macros': {{'calories', 'protein_g', 'carbs_g', 'fat_g'}}}}"
    contents = [prompt]
    if input_data.image_base64:
        contents.append(types.Part.from_bytes(data=base64.b64decode(input_data.image_base64), mime_type='image/jpeg'))

    response = client.models.generate_content(model="gemini-1.5-flash", contents=contents)
    data = json.loads(response.text.strip().split("```json")[1].split("```")[0])

    # Automatic Truth Engine Check
    usda = get_usda_data(data["items"][0]["name"])
    final_cals = usda["calories"] if usda else data["total_macros"]["calories"]

    new_meal = Meal(
        user_id=input_data.user_id,
        description=input_data.description or data["items"][0]["name"],
        calories=final_cals,
        protein_g=data["total_macros"]["protein_g"],
        carbs_g=data["total_macros"]["carbs_g"],
        fat_g=data["total_macros"]["fat_g"],
        image_data=input_data.image_base64,
        items_json=json.dumps(data["items"])
    )
    session.add(new_meal)
    session.commit()
    session.refresh(new_meal)
    return new_meal

# --- RESTORED MANUAL & WORKOUT ENDPOINTS ---
@app.post("/api/search-food/")
def manual_search(query_data: dict):
    data = get_usda_data(query_data["query"])
    if not data: raise HTTPException(status_code=404, detail="Not found")
    return data

@app.post("/meals/", response_model=Meal)
def create_meal_manual(meal: Meal, session: Session = Depends(get_session)):
    session.add(meal)
    session.commit()
    session.refresh(meal)
    return meal

@app.post("/workouts/", response_model=Workout)
def create_workout(workout: Workout, session: Session = Depends(get_session)):
    session.add(workout)
    session.commit()
    session.refresh(workout)
    return workout

@app.get("/meals/", response_model=List[Meal])
def get_meals(session: Session = Depends(get_session)):
    return session.exec(select(Meal)).all()

@app.get("/workouts/", response_model=List[Workout])
def get_workouts(session: Session = Depends(get_session)):
    return session.exec(select(Workout)).all()
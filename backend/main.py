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
class UserToken(SQLModel, table=True):
    user_id: int = Field(primary_key=True)
    access_token: str
    refresh_token: str

class DailyMetric(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    date_logged: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    steps: int = 0
    active_minutes: int = 0
    sleep_minutes: int = 0
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
from fastapi.responses import RedirectResponse
import urllib.parse

FITBIT_CLIENT_ID = os.environ.get("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.environ.get("FITBIT_CLIENT_SECRET")
REDIRECT_URI = "http://localhost:8000/auth/fitbit/callback"

@app.get("/auth/fitbit/login")
def fitbit_login():
    """Step 1: Redirect user to Fitbit's authorization page."""
    scopes = "activity sleep profile"
    auth_url = (
        f"https://www.fitbit.com/oauth2/authorize?response_type=code"
        f"&client_id={FITBIT_CLIENT_ID}&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
        f"&scope={urllib.parse.quote(scopes)}"
    )
    return RedirectResponse(url=auth_url)

@app.get("/auth/fitbit/callback")
def fitbit_callback(code: str, session: Session = Depends(get_session)):
    """Step 2: Exchange authorization code for access & refresh tokens."""
    # Fitbit requires Basic Auth with Base64 encoded Client ID:Secret
    auth_str = f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {b64_auth}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "client_id": FITBIT_CLIENT_ID,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code": code
    }
    
    response = requests.post("https://api.fitbit.com/oauth2/token", headers=headers, data=data)
    token_data = response.json()
    
    if "access_token" not in token_data:
        raise HTTPException(status_code=400, detail="Failed to retrieve token")
        
    # Hardcoded user_id=1 for demonstration. In production, get this from your auth system.
    user_id = 1 
    
    # Save or update the token in the database
    existing_token = session.get(UserToken, user_id)
    if existing_token:
        existing_token.access_token = token_data["access_token"]
        existing_token.refresh_token = token_data["refresh_token"]
        session.add(existing_token)
    else:
        new_token = UserToken(
            user_id=user_id,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"]
        )
        session.add(new_token)
        
    session.commit()
    
    # Redirect back to your Next.js frontend
    return RedirectResponse(url="http://localhost:3000/dashboard?fitbit_connected=true")
@app.post("/api/sync-fitbit/{user_id}")
def sync_fitbit_data(user_id: int, session: Session = Depends(get_session)):
    user_token = session.get(UserToken, user_id)
    if not user_token:
        raise HTTPException(status_code=404, detail="User Fitbit not connected")

    headers = {"Authorization": f"Bearer {user_token.access_token}"}
    today = datetime.now().strftime("%Y-%m-%d")

    # 1. Fetch Activity (Steps & Active Minutes)
    activity_url = f"https://api.fitbit.com/1/user/-/activities/date/{today}.json"
    activity_res = requests.get(activity_url, headers=headers).json()
    
    steps = activity_res.get("summary", {}).get("steps", 0)
    
    # Fitbit categorizes active minutes into lightly, fairly, and very active. 
    # Usually, "active minutes" is fairly + very active.
    fairly_active = activity_res.get("summary", {}).get("fairlyActiveMinutes", 0)
    very_active = activity_res.get("summary", {}).get("veryActiveMinutes", 0)
    total_active_minutes = fairly_active + very_active

    # 2. Fetch Sleep
    sleep_url = f"https://api.fitbit.com/1.2/user/-/sleep/date/{today}.json"
    sleep_res = requests.get(sleep_url, headers=headers).json()
    
    sleep_minutes = 0
    if sleep_res.get("sleep") and len(sleep_res["sleep"]) > 0:
        sleep_minutes = sleep_res["sleep"][0].get("minutesAsleep", 0)

    # 3. Save to Database
    # Check if a metric entry already exists for today
    statement = select(DailyMetric).where(DailyMetric.user_id == user_id, DailyMetric.date_logged == today)
    metric = session.exec(statement).first()

    if metric:
        metric.steps = steps
        metric.active_minutes = total_active_minutes
        metric.sleep_minutes = sleep_minutes
        session.add(metric)
    else:
        new_metric = DailyMetric(
            user_id=user_id,
            steps=steps,
            active_minutes=total_active_minutes,
            sleep_minutes=sleep_minutes,
            date_logged=today
        )
        session.add(new_metric)

    session.commit()
    return {"message": "Fitbit data synchronized successfully", "steps": steps, "active_minutes": total_active_minutes, "sleep_minutes": sleep_minutes}
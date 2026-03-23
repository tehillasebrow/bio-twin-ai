import os
import json
import time
import base64
from typing import Optional
import requests

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

# 3. The Data-Driven Waterfall Hierarchy
# Ordered from highest reasoning capability to highest quota limit based on your API tier
MODEL_CASCADE = [
    "gemini-3.0-flash",                 # 20 Requests Per Day
    "gemini-2.5-flash",                 # 20 Requests Per Day
    "gemini-2.5-flash-lite",            # 20 Requests Per Day
    "gemini-3.1-flash-lite-preview"     # 500 Requests Per Day (The Fail-Safe)
]

# Updated Pydantic Schema (Accepts optional image)
class MealTextInput(BaseModel):
    user_id: int
    description: str
    image_base64: Optional[str] = None  

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
    
    # THE MASTER PROMPT: Chain of Thought + Few-Shot Examples + Edge Cases
    prompt_text = f"""
    You are an elite nutritionist AI and visual food-recognition engine.
    
    USER TEXT INPUT: "{input_data.description}"
    
    STEP-BY-STEP INSTRUCTIONS:
    1. IMAGE CHECK: If the user text says "Analyze the food in this image." but no image is provided, or if the image is clearly not food, you MUST output the food_name as "ERROR_NOT_FOOD".
    2. REASONING: Analyze the image and text. Think step-by-step. Pay attention to cultural foods (e.g., Gefilte fish looks like pale fish patties, often with a carrot slice). 
    3. ESTIMATION: Estimate the nutritional profile based on standard USDA data and the visible portion size.
    4. FORMATTING: You may write out your reasoning, but your final output MUST be a strict JSON object wrapped in ```json  ``` markdown.

    EXAMPLE OUTPUT FORMAT:
    The image shows two pale fish patties with carrot slices. This is likely traditional Jewish gefilte fish. A standard piece is about 50-70 calories.
    ```json
    {{
      "food_name": "Gefilte Fish",
      "calories": 140,
      "protein_g": 16.0,
      "carbs_g": 14.0,
      "fat_g": 2.0
    }}
    ```
    """
    
    contents = [prompt_text]
    
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
            raise HTTPException(status_code=400, detail="Invalid image encoding")

    # The Waterfall Loop
    for model_name in MODEL_CASCADE:
        try:
            print(f"Attempting AI analysis with: {model_name}...")
            
            response = client.models.generate_content(
                model=model_name,
                contents=contents
            )
            
            text_content = response.text.strip()
            
            # The Markdown Stripper (Extracts only the JSON, ignoring the AI's reasoning text)
            if "```json" in text_content:
                json_str = text_content.split("```json")[1].split("```")[0].strip()
            elif "```" in text_content:
                json_str = text_content.split("```")[1].split("```")[0].strip()
            else:
                json_str = text_content # Fallback if it disobeys

            ai_output = json.loads(json_str)
            
            # THE ESCAPE HATCH: Block non-food items and empty submissions
            food_name = ai_output.get("food_name", "Unknown Food")
            if food_name == "ERROR_NOT_FOOD":
                raise HTTPException(status_code=400, detail="Security Flag: No valid food detected.")

            # ENHANCE THE DESCRIPTION
            if input_data.description in ["Analyze the food in this image.", ""]:
                final_description = food_name
            else:
                final_description = f"{food_name} | {input_data.description}"

            new_meal = Meal(
                user_id=input_data.user_id,
                description=final_description,
                calories=int(ai_output.get("calories", 0)),
                protein_g=float(ai_output.get("protein_g", 0.0)),
                carbs_g=float(ai_output.get("carbs_g", 0.0)),
                fat_g=float(ai_output.get("fat_g", 0.0))
            )
            
            session.add(new_meal)
            session.commit()
            session.refresh(new_meal)
            
            print(f"Success! {model_name} completed the request.")
            return new_meal

        except HTTPException:
            raise # Pass intentional validation errors to the frontend
            
        except Exception as e:
            error_msg = str(e).lower()
            if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
                print(f"Quota exhausted for {model_name}. Falling back to next model...")
                continue # Jump to the next model in the list
            else:
                print(f"Unexpected error with {model_name}: {error_msg}")
                continue # If it's a weird error, still try the backup model

    # If all models fail, trigger the fallback to Manual Entry
    raise HTTPException(
        status_code=429, 
        detail="All AI models are currently exhausted. Please use the Truth Engine for manual entry."
    )

# --- USDA NUTRITION API & MANUAL ENTRY ---
class FoodSearchQuery(BaseModel):
    query: str

@app.post("/api/search-food/")
def search_food_database(query_data: FoodSearchQuery):
    # Using the USDA's built-in DEMO_KEY for quick access
    api_key = os.environ.get("USDA_API_KEY", "DEMO_KEY")
    url = f"https://api.nal.usda.gov/fdc/v1/foods/search?api_key={api_key}&query={query_data.query}&pageSize=1"
    
    try:
        response = requests.get(url)
        data = response.json()
        
        if not data.get("foods"):
            raise HTTPException(status_code=404, detail="Food not found in USDA database.")
        
        # Grab the top search result
        food_item = data["foods"][0]
        
        # Safely extract macros from the USDA format
        macros = {"calories": 0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
        
        for nutrient in food_item.get("foodNutrients", []):
            name = nutrient.get("nutrientName", "").lower()
            amount = nutrient.get("value", 0.0)
            unit = nutrient.get("unitName", "").lower()
            
            if "energy" in name and "kcal" in unit:
                macros["calories"] = int(amount)
            elif "protein" in name:
                macros["protein_g"] = float(amount)
            elif "carbohydrate" in name:
                macros["carbs_g"] = float(amount)
            elif "total lipid (fat)" in name:
                macros["fat_g"] = float(amount)
                
        return {
            "description": food_item.get("description", query_data.query).title(),
            "calories": macros["calories"],
            "protein_g": macros["protein_g"],
            "carbs_g": macros["carbs_g"],
            "fat_g": macros["fat_g"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error connecting to USDA Database.")

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
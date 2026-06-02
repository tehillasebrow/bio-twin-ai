import os
import json
import base64
import urllib.parse
from datetime import datetime, timedelta
from typing import Optional, List

import requests
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from contextlib import asynccontextmanager

from sqlmodel import Session, select

from google import genai
from google.genai import types

from database import (
    create_db_and_tables,
    get_session,
    User,
    Meal,
    Workout,
    UserToken,
    DailyMetric,
    WeightLog,
)


load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan, title="Bio-Twin AI Backend")

# Comma-separated list of allowed frontend origins.
# e.g. ALLOWED_ORIGINS="https://bio-twin-ai.vercel.app"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
GEMINI_MODEL = "gemini-2.5-flash"


# ---------- Helpers ----------
def parse_gemini_json(text: str) -> dict:
    """Pull a JSON object out of a Gemini response that may be fenced or raw."""
    cleaned = text.strip()
    if "```" in cleaned:
        parts = cleaned.split("```")
        for part in parts:
            stripped = part.strip()
            if stripped.startswith("json"):
                stripped = stripped[4:].strip()
            if stripped.startswith("{") or stripped.startswith("["):
                return json.loads(stripped)
    return json.loads(cleaned)


def get_usda_data(query: str) -> Optional[dict]:
    api_key = os.environ.get("USDA_API_KEY", "DEMO_KEY")
    url = (
        f"https://api.nal.usda.gov/fdc/v1/foods/search"
        f"?api_key={api_key}&query={urllib.parse.quote(query)}&pageSize=1"
    )
    try:
        res = requests.get(url, timeout=10).json()
        if not res.get("foods"):
            return None
        food = res["foods"][0]
        macros = {
            "calories": 0,
            "protein": 0.0,
            "carbs": 0.0,
            "fat": 0.0,
            "name": food.get("description"),
        }
        for n in food.get("foodNutrients", []):
            name = n.get("nutrientName", "").lower()
            val = n.get("value", 0.0)
            unit = n.get("unitName", "").lower()
            if "energy" in name and "kcal" in unit:
                macros["calories"] = int(val)
            elif "protein" in name:
                macros["protein"] = val
            elif "carbohydrate" in name:
                macros["carbs"] = val
            elif "total lipid (fat)" in name:
                macros["fat"] = val
        return macros
    except Exception:
        return None


def update_streak(session: Session, user_id: int) -> int:
    """Recalculate the user's logging streak based on consecutive days with at least one meal."""
    user = session.get(User, user_id)
    if not user:
        user = User(id=user_id, email=f"user{user_id}@local")
        session.add(user)
        session.commit()
        session.refresh(user)

    today_str = datetime.now().strftime("%Y-%m-%d")
    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    todays_meals = session.exec(
        select(Meal).where(Meal.user_id == user_id, Meal.date_logged == today_str)
    ).all()
    if not todays_meals:
        return user.current_streak

    if user.last_streak_date == today_str:
        return user.current_streak

    if user.last_streak_date == yesterday_str:
        user.current_streak += 1
    else:
        user.current_streak = 1

    user.last_streak_date = today_str
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.current_streak


# ---------- Schemas ----------
class MealTextInput(BaseModel):
    user_id: int
    description: str
    image_base64: Optional[str] = None


class WeightInput(BaseModel):
    user_id: int
    weight_lbs: float


class UserSetup(BaseModel):
    user_id: int
    email: str
    name: Optional[str] = None
    current_weight_lbs: Optional[float] = None
    height_in: Optional[float] = None
    daily_calorie_goal: Optional[int] = None


# ---------- AI Meal Logging (Vision + Text) ----------
@app.post("/ai/log-meal/", response_model=Meal)
def ai_log_meal(input_data: MealTextInput, session: Session = Depends(get_session)):
    if not input_data.description and not input_data.image_base64:
        raise HTTPException(status_code=400, detail="Provide a description or image")

    prompt = (
        "You are a nutrition parser. Analyze the meal "
        f"described as: '{input_data.description or '(see image)'}'. "
        "If an image is provided, identify foods and estimate portion sizes from it. "
        "Return ONLY valid JSON in this exact shape: "
        '{"items": [{"name": str, "quantity": str, "calories": int}], '
        '"total_macros": {"calories": int, "protein_g": float, "carbs_g": float, "fat_g": float}, '
        '"is_food": true}. '
        "If the input is not food (a car, a person, random text), return "
        '{"is_food": false, "reason": "..."}.'
    )

    contents = [prompt]
    if input_data.image_base64:
        try:
            contents.append(
                types.Part.from_bytes(
                    data=base64.b64decode(input_data.image_base64),
                    mime_type="image/jpeg",
                )
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid image data")

    try:
        response = client.models.generate_content(model=GEMINI_MODEL, contents=contents)
        data = parse_gemini_json(response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {e}")

    if data.get("is_food") is False:
        raise HTTPException(
            status_code=400,
            detail=f"Not a food item: {data.get('reason', 'unknown')}",
        )

    if not data.get("items") or not data.get("total_macros"):
        raise HTTPException(status_code=500, detail="AI returned malformed payload")

    # Truth Engine: cross-check with USDA on the dominant item
    primary_item = data["items"][0]["name"]
    usda = get_usda_data(primary_item)
    ai_cals = int(data["total_macros"].get("calories", 0))
    final_cals = ai_cals
    usda_verified = False
    flagged = False
    if usda and usda["calories"] > 0:
        usda_verified = True
        if ai_cals == 0:
            final_cals = usda["calories"]
        else:
            delta = abs(ai_cals - usda["calories"]) / max(usda["calories"], 1)
            if delta > 0.20:
                flagged = True

    new_meal = Meal(
        user_id=input_data.user_id,
        description=input_data.description or primary_item,
        calories=final_cals,
        protein_g=float(data["total_macros"].get("protein_g", 0)),
        carbs_g=float(data["total_macros"].get("carbs_g", 0)),
        fat_g=float(data["total_macros"].get("fat_g", 0)),
        image_data=input_data.image_base64,
        items_json=json.dumps(data["items"]),
        usda_verified=usda_verified,
        ai_estimate_flagged=flagged,
    )
    session.add(new_meal)
    session.commit()
    session.refresh(new_meal)

    update_streak(session, input_data.user_id)
    return new_meal


# ---------- Manual food + USDA search ----------
@app.post("/api/search-food/")
def manual_search(query_data: dict):
    data = get_usda_data(query_data.get("query", ""))
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return data


@app.post("/meals/", response_model=Meal)
def create_meal_manual(meal: Meal, session: Session = Depends(get_session)):
    session.add(meal)
    session.commit()
    session.refresh(meal)
    update_streak(session, meal.user_id)
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


# ---------- User profile + weight ----------
@app.post("/api/user/", response_model=User)
def upsert_user(payload: UserSetup, session: Session = Depends(get_session)):
    user = session.get(User, payload.user_id)
    if user:
        if payload.email:
            user.email = payload.email
        if payload.name is not None:
            user.name = payload.name
        if payload.current_weight_lbs is not None:
            user.current_weight_lbs = payload.current_weight_lbs
        if payload.height_in is not None:
            user.height_in = payload.height_in
        if payload.daily_calorie_goal is not None:
            user.daily_calorie_goal = payload.daily_calorie_goal
    else:
        user = User(
            id=payload.user_id,
            email=payload.email,
            name=payload.name,
            current_weight_lbs=payload.current_weight_lbs,
            height_in=payload.height_in,
            daily_calorie_goal=payload.daily_calorie_goal or 2500,
        )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@app.get("/api/user/{user_id}", response_model=User)
def get_user(user_id: int, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        user = User(id=user_id, email=f"user{user_id}@local")
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


@app.post("/api/weight/", response_model=WeightLog)
def log_weight(payload: WeightInput, session: Session = Depends(get_session)):
    entry = WeightLog(user_id=payload.user_id, weight_lbs=payload.weight_lbs)
    session.add(entry)

    user = session.get(User, payload.user_id)
    if user:
        user.current_weight_lbs = payload.weight_lbs
        session.add(user)

    session.commit()
    session.refresh(entry)
    return entry


@app.get("/api/weight/{user_id}", response_model=List[WeightLog])
def get_weight_history(user_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(WeightLog).where(WeightLog.user_id == user_id).order_by(WeightLog.date_logged)
    ).all()


# ---------- Daily metrics (used by chart + coach) ----------
@app.get("/api/metrics/{user_id}", response_model=List[DailyMetric])
def get_metrics(user_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(DailyMetric).where(DailyMetric.user_id == user_id).order_by(DailyMetric.date_logged)
    ).all()


class MetricInput(BaseModel):
    user_id: int
    steps: Optional[int] = None
    active_minutes: Optional[int] = None
    sleep_minutes: Optional[int] = None
    resting_heart_rate: Optional[int] = None
    date_logged: Optional[str] = None


@app.post("/api/metrics/", response_model=DailyMetric)
def upsert_metric(payload: MetricInput, session: Session = Depends(get_session)):
    """Upsert today's (or a specific day's) DailyMetric. Only sets fields you pass."""
    date = payload.date_logged or datetime.now().strftime("%Y-%m-%d")
    existing = session.exec(
        select(DailyMetric).where(
            DailyMetric.user_id == payload.user_id, DailyMetric.date_logged == date
        )
    ).first()
    if existing:
        if payload.steps is not None:
            existing.steps = payload.steps
        if payload.active_minutes is not None:
            existing.active_minutes = payload.active_minutes
        if payload.sleep_minutes is not None:
            existing.sleep_minutes = payload.sleep_minutes
        if payload.resting_heart_rate is not None:
            existing.resting_heart_rate = payload.resting_heart_rate
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing
    new = DailyMetric(
        user_id=payload.user_id,
        date_logged=date,
        steps=payload.steps or 0,
        active_minutes=payload.active_minutes or 0,
        sleep_minutes=payload.sleep_minutes or 0,
        resting_heart_rate=payload.resting_heart_rate,
    )
    session.add(new)
    session.commit()
    session.refresh(new)
    return new


# ---------- AI Chat (general chat + intent-based logging) ----------
class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatInput(BaseModel):
    user_id: int
    message: str
    history: Optional[List[ChatMessage]] = None


@app.post("/api/chat/")
def ai_chat(payload: ChatInput, session: Session = Depends(get_session)):
    """Smart chat: detects whether the user is logging something or just chatting,
    writes to DB if appropriate, and returns a conversational reply."""
    history_text = ""
    if payload.history:
        for m in payload.history[-6:]:  # last 6 turns
            history_text += f"\n{m.role.upper()}: {m.content}"

    classifier_prompt = (
        "You are the brain of a fitness app. Read the user's message and decide if "
        "they are LOGGING data or just CHATTING. "
        "Return ONLY valid JSON in this exact shape:\n"
        '{\n'
        '  "intent": "chat" | "log_metric" | "log_weight" | "log_workout",\n'
        '  "data": {\n'
        '     "steps": int|null, "sleep_minutes": int|null, "active_minutes": int|null,\n'
        '     "resting_heart_rate": int|null,\n'
        '     "weight_lbs": float|null,\n'
        '     "workout_type": string|null, "duration_minutes": int|null\n'
        '  },\n'
        '  "reply": "warm conversational response, 1-3 sentences"\n'
        '}\n'
        "Rules:\n"
        "- If they mention sleep in hours, convert to minutes (e.g. '7 hours' = 420).\n"
        "- If they mention steps, active minutes, sleep, or heart rate → intent=log_metric.\n"
        "- If they mention their weight → intent=log_weight.\n"
        "- If they mention a workout they did → intent=log_workout.\n"
        "- Otherwise → intent=chat and leave data fields null.\n"
        "- ALWAYS write a friendly, supportive reply.\n"
        "- For meals, tell them to use the AI Lens form (don't log via chat).\n\n"
        f"CONVERSATION SO FAR:{history_text}\n"
        f"USER MESSAGE: {payload.message}"
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL, contents=[classifier_prompt]
        )
        parsed = parse_gemini_json(response.text)
    except Exception as e:
        return {"reply": "Sorry — my brain hiccuped. Try again?", "intent": "chat", "logged": None, "error": str(e)}

    intent = parsed.get("intent", "chat")
    data = parsed.get("data", {}) or {}
    reply = parsed.get("reply", "Got it.")
    logged = None

    today = datetime.now().strftime("%Y-%m-%d")

    if intent == "log_metric":
        existing = session.exec(
            select(DailyMetric).where(
                DailyMetric.user_id == payload.user_id, DailyMetric.date_logged == today
            )
        ).first()
        if existing:
            if data.get("steps") is not None:
                existing.steps = int(data["steps"])
            if data.get("active_minutes") is not None:
                existing.active_minutes = int(data["active_minutes"])
            if data.get("sleep_minutes") is not None:
                existing.sleep_minutes = int(data["sleep_minutes"])
            if data.get("resting_heart_rate") is not None:
                existing.resting_heart_rate = int(data["resting_heart_rate"])
            session.add(existing)
            session.commit()
            session.refresh(existing)
            logged = {"type": "metric", "record": existing.model_dump()}
        else:
            new = DailyMetric(
                user_id=payload.user_id,
                date_logged=today,
                steps=int(data.get("steps") or 0),
                active_minutes=int(data.get("active_minutes") or 0),
                sleep_minutes=int(data.get("sleep_minutes") or 0),
                resting_heart_rate=int(data["resting_heart_rate"])
                if data.get("resting_heart_rate") is not None
                else None,
            )
            session.add(new)
            session.commit()
            session.refresh(new)
            logged = {"type": "metric", "record": new.model_dump()}

    elif intent == "log_weight" and data.get("weight_lbs") is not None:
        w = WeightLog(user_id=payload.user_id, weight_lbs=float(data["weight_lbs"]))
        session.add(w)
        user = session.get(User, payload.user_id)
        if user:
            user.current_weight_lbs = float(data["weight_lbs"])
            session.add(user)
        session.commit()
        session.refresh(w)
        logged = {"type": "weight", "record": w.model_dump()}

    elif intent == "log_workout" and data.get("workout_type") and data.get("duration_minutes"):
        wk = Workout(
            user_id=payload.user_id,
            type=str(data["workout_type"]),
            duration_minutes=int(data["duration_minutes"]),
            calories_burned=int(data["duration_minutes"]) * 10,
        )
        session.add(wk)
        session.commit()
        session.refresh(wk)
        logged = {"type": "workout", "record": wk.model_dump()}

    return {"reply": reply, "intent": intent, "logged": logged}


# ---------- Report 6: AI Coach ----------
@app.get("/api/coach/{user_id}")
def get_coach_insight(user_id: int, session: Session = Depends(get_session)):
    """Pulls last 7 days of meals, workouts, and metrics; asks Gemini to coach."""
    cutoff = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    meals = session.exec(
        select(Meal).where(Meal.user_id == user_id, Meal.date_logged >= cutoff)
    ).all()
    workouts = session.exec(
        select(Workout).where(Workout.user_id == user_id, Workout.date_logged >= cutoff)
    ).all()
    metrics = session.exec(
        select(DailyMetric).where(
            DailyMetric.user_id == user_id, DailyMetric.date_logged >= cutoff
        )
    ).all()

    if not meals and not workouts and not metrics:
        return {
            "insight": "Log a few days of meals and workouts so the coach has something to work with."
        }

    summary = {
        "days_with_data": len(set(m.date_logged for m in meals)),
        "meals": [
            {
                "date": m.date_logged,
                "description": m.description,
                "calories": m.calories,
                "protein_g": m.protein_g,
                "carbs_g": m.carbs_g,
                "fat_g": m.fat_g,
            }
            for m in meals
        ],
        "workouts": [
            {
                "date": w.date_logged,
                "type": w.type,
                "duration_minutes": w.duration_minutes,
                "calories_burned": w.calories_burned,
            }
            for w in workouts
        ],
        "daily_metrics": [
            {
                "date": d.date_logged,
                "steps": d.steps,
                "active_minutes": d.active_minutes,
                "sleep_minutes": d.sleep_minutes,
            }
            for d in metrics
        ],
    }

    prompt = (
        "You are a warm, supportive fitness coach — encouraging, never mean. "
        "The user's last 7 days of data follows. Notice what's going well first, "
        "then gently point out one thing to focus on. Analyze sleep, protein, "
        "calories, activity, and recovery. "
        "Return ONLY valid JSON: "
        '{"insight": "2-3 sentence positive but honest analysis", '
        '"action": "one small, encouraging instruction for tomorrow"}. '
        "Be specific and reference actual numbers from the data. "
        "Use friendly language — never shame the user.\n\n"
        f"DATA: {json.dumps(summary)}"
    )

    try:
        response = client.models.generate_content(model=GEMINI_MODEL, contents=[prompt])
        return parse_gemini_json(response.text)
    except Exception as e:
        return {"insight": "Coach is offline.", "action": str(e)}


# ---------- Reports 7 & 8: streak + weight prediction ----------
@app.get("/api/streak/{user_id}")
def get_streak(user_id: int, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        return {"streak": 0, "goal": 2500}
    return {
        "streak": user.current_streak,
        "last_streak_date": user.last_streak_date,
        "goal": user.daily_calorie_goal,
    }


@app.get("/api/prediction/{user_id}")
def predict_weight(user_id: int, days_ahead: int = 30, session: Session = Depends(get_session)):
    """Linear-regression projection of weight `days_ahead` days from now,
    based on average daily calorie deficit/surplus across the last 14 days.
    Falls back to weight-log regression if calorie data is missing.
    """
    user = session.get(User, user_id)
    if not user or user.current_weight_lbs is None:
        raise HTTPException(
            status_code=400,
            detail="Set current_weight_lbs on the user profile before predicting.",
        )

    end = datetime.now().date()
    start = end - timedelta(days=14)
    start_str = start.strftime("%Y-%m-%d")

    meals = session.exec(
        select(Meal).where(Meal.user_id == user_id, Meal.date_logged >= start_str)
    ).all()
    workouts = session.exec(
        select(Workout).where(Workout.user_id == user_id, Workout.date_logged >= start_str)
    ).all()
    metrics = session.exec(
        select(DailyMetric).where(
            DailyMetric.user_id == user_id, DailyMetric.date_logged >= start_str
        )
    ).all()

    # Aggregate per-day net calories
    days = {}
    for i in range(14):
        d = (start + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        days[d] = {"intake": 0, "burn": 0}
    for m in meals:
        if m.date_logged in days:
            days[m.date_logged]["intake"] += m.calories
    for w in workouts:
        if w.date_logged in days:
            days[w.date_logged]["burn"] += w.calories_burned
    for dm in metrics:
        if dm.date_logged in days:
            days[dm.date_logged]["burn"] += dm.active_minutes * 7  # rough kcal/min

    # BMR baseline (Mifflin-St Jeor, assuming 30y/o male if no height — rough)
    bmr = 10 * (user.current_weight_lbs / 2.205) + 6.25 * (user.height_in or 70) * 2.54 - 5 * 30 + 5

    daily_deltas = []
    for day, vals in days.items():
        if vals["intake"] == 0:
            continue
        # net = intake - (bmr + activity burn)
        daily_deltas.append(vals["intake"] - (bmr + vals["burn"]))

    # Medically-sane cap: max ~2 lb/week sustained = 0.286 lb/day
    MAX_LBS_PER_DAY = 0.286
    MIN_DAYS_REQUIRED = 4

    def clamp_slope(s: float) -> float:
        return max(-MAX_LBS_PER_DAY, min(MAX_LBS_PER_DAY, s))

    if len(daily_deltas) < MIN_DAYS_REQUIRED:
        # Not enough calorie history — try weight-log regression instead
        history = session.exec(
            select(WeightLog).where(WeightLog.user_id == user_id).order_by(WeightLog.date_logged)
        ).all()
        if len(history) < 2:
            return {
                "current_weight_lbs": user.current_weight_lbs,
                "predicted_weight_lbs": user.current_weight_lbs,
                "days_ahead": days_ahead,
                "trend": "insufficient data",
                "slope_lbs_per_day": 0.0,
                "source": "insufficient_data",
                "days_logged": len(daily_deltas),
                "note": f"Log at least {MIN_DAYS_REQUIRED} days of meals for a real projection.",
            }
        first, last = history[0], history[-1]
        d0 = datetime.strptime(first.date_logged, "%Y-%m-%d")
        d1 = datetime.strptime(last.date_logged, "%Y-%m-%d")
        days_span = max((d1 - d0).days, 1)
        slope = clamp_slope((last.weight_lbs - first.weight_lbs) / days_span)
        predicted = user.current_weight_lbs + slope * days_ahead
        return {
            "current_weight_lbs": user.current_weight_lbs,
            "predicted_weight_lbs": round(predicted, 2),
            "days_ahead": days_ahead,
            "trend": "rising" if slope > 0.02 else ("falling" if slope < -0.02 else "stable"),
            "slope_lbs_per_day": round(slope, 4),
            "source": "weight_log_regression",
        }

    avg_daily_delta_kcal = sum(daily_deltas) / len(daily_deltas)
    # 3500 kcal ≈ 1 lb body fat, then clamp to medically-sane rate
    raw_lbs_per_day = avg_daily_delta_kcal / 3500.0
    lbs_per_day = clamp_slope(raw_lbs_per_day)
    predicted = user.current_weight_lbs + lbs_per_day * days_ahead

    return {
        "current_weight_lbs": user.current_weight_lbs,
        "predicted_weight_lbs": round(predicted, 2),
        "days_ahead": days_ahead,
        "avg_daily_delta_kcal": round(avg_daily_delta_kcal, 1),
        "slope_lbs_per_day": round(lbs_per_day, 4),
        "raw_slope_lbs_per_day": round(raw_lbs_per_day, 4),
        "days_logged": len(daily_deltas),
        "capped": abs(raw_lbs_per_day) > MAX_LBS_PER_DAY,
        "trend": "gaining"
        if lbs_per_day > 0.02
        else ("losing" if lbs_per_day < -0.02 else "maintaining"),
        "source": "calorie_balance",
    }


# ---------- Fitbit OAuth ----------
FITBIT_CLIENT_ID = os.environ.get("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.environ.get("FITBIT_CLIENT_SECRET")
# Public URL of THIS backend (used to build the Fitbit OAuth callback).
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
# Public URL of the frontend (where we send the user after OAuth).
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
REDIRECT_URI = f"{BACKEND_URL}/auth/fitbit/callback"


@app.get("/auth/fitbit/login")
def fitbit_login():
    scopes = "activity sleep profile heartrate"
    auth_url = (
        f"https://www.fitbit.com/oauth2/authorize?response_type=code"
        f"&client_id={FITBIT_CLIENT_ID}&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
        f"&scope={urllib.parse.quote(scopes)}"
    )
    return RedirectResponse(url=auth_url)


@app.get("/auth/fitbit/callback")
def fitbit_callback(code: str, session: Session = Depends(get_session)):
    auth_str = f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    headers = {
        "Authorization": f"Basic {b64_auth}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "client_id": FITBIT_CLIENT_ID,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
        "code": code,
    }
    response = requests.post("https://api.fitbit.com/oauth2/token", headers=headers, data=data)
    token_data = response.json()
    if "access_token" not in token_data:
        raise HTTPException(status_code=400, detail="Failed to retrieve token")

    user_id = 1
    existing = session.get(UserToken, user_id)
    if existing:
        existing.access_token = token_data["access_token"]
        existing.refresh_token = token_data["refresh_token"]
        session.add(existing)
    else:
        session.add(
            UserToken(
                user_id=user_id,
                access_token=token_data["access_token"],
                refresh_token=token_data["refresh_token"],
            )
        )
    session.commit()
    return RedirectResponse(url=f"{FRONTEND_URL}/?fitbit_connected=true")


def _refresh_fitbit_token(session: Session, user_token: UserToken) -> UserToken:
    auth_str = f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()
    res = requests.post(
        "https://api.fitbit.com/oauth2/token",
        headers={
            "Authorization": f"Basic {b64_auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "refresh_token", "refresh_token": user_token.refresh_token},
    ).json()
    if "access_token" in res:
        user_token.access_token = res["access_token"]
        user_token.refresh_token = res.get("refresh_token", user_token.refresh_token)
        session.add(user_token)
        session.commit()
        session.refresh(user_token)
    return user_token


@app.post("/api/sync-fitbit/{user_id}")
def sync_fitbit_data(user_id: int, session: Session = Depends(get_session)):
    user_token = session.get(UserToken, user_id)
    if not user_token:
        raise HTTPException(status_code=404, detail="User Fitbit not connected")

    today = datetime.now().strftime("%Y-%m-%d")

    def fetch(url, retried=False):
        headers = {"Authorization": f"Bearer {user_token.access_token}"}
        res = requests.get(url, headers=headers)
        if res.status_code == 401 and not retried:
            _refresh_fitbit_token(session, user_token)
            return fetch(url, retried=True)
        return res.json()

    activity_res = fetch(f"https://api.fitbit.com/1/user/-/activities/date/{today}.json")
    summary = activity_res.get("summary", {})
    steps = summary.get("steps", 0)
    total_active_minutes = summary.get("fairlyActiveMinutes", 0) + summary.get(
        "veryActiveMinutes", 0
    )
    resting_hr = summary.get("restingHeartRate")

    sleep_res = fetch(f"https://api.fitbit.com/1.2/user/-/sleep/date/{today}.json")
    sleep_minutes = 0
    if sleep_res.get("sleep"):
        sleep_minutes = sleep_res["sleep"][0].get("minutesAsleep", 0)

    statement = select(DailyMetric).where(
        DailyMetric.user_id == user_id, DailyMetric.date_logged == today
    )
    metric = session.exec(statement).first()
    if metric:
        metric.steps = steps
        metric.active_minutes = total_active_minutes
        metric.sleep_minutes = sleep_minutes
        metric.resting_heart_rate = resting_hr
        session.add(metric)
    else:
        session.add(
            DailyMetric(
                user_id=user_id,
                steps=steps,
                active_minutes=total_active_minutes,
                sleep_minutes=sleep_minutes,
                resting_heart_rate=resting_hr,
                date_logged=today,
            )
        )
    session.commit()
    return {
        "message": "Fitbit data synchronized",
        "steps": steps,
        "active_minutes": total_active_minutes,
        "sleep_minutes": sleep_minutes,
        "resting_heart_rate": resting_hr,
    }


@app.get("/")
def root():
    return {"status": "Bio-Twin AI backend running"}

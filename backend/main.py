from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from contextlib import asynccontextmanager
from database import create_db_and_tables, get_session, User, Meal, Workout

# This ensures the database and tables are created right when the server starts
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

# Keep your existing CORS setup here
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
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
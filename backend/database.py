from sqlmodel import SQLModel, Field, create_engine, Session
from typing import Optional

# 1. Define the Models (These become your database tables)
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str
    # We will add gamification fields like 'current_streak' here in Week 7

class Meal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    description: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    image_url: Optional[str] = None

class Workout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    type: str
    duration_minutes: int
    calories_burned: int

# 2. Setup SQLite Database Engine
sqlite_file_name = "biotwin.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
# echo=True prints all SQL queries to the terminal for easy debugging
engine = create_engine(sqlite_url, echo=True) 

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
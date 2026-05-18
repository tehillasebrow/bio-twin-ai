from sqlmodel import SQLModel, Field, create_engine, Session
from typing import Optional
from datetime import datetime


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: Optional[str] = None
    current_weight_lbs: Optional[float] = None
    height_in: Optional[float] = None
    daily_calorie_goal: int = 2500
    current_streak: int = 0
    last_streak_date: Optional[str] = None


class Meal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    description: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    image_data: Optional[str] = None
    date_logged: str = Field(default_factory=_today)
    items_json: Optional[str] = None
    usda_verified: bool = False
    ai_estimate_flagged: bool = False


class Workout(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    type: str
    duration_minutes: int
    calories_burned: int
    date_logged: str = Field(default_factory=_today)


class UserToken(SQLModel, table=True):
    user_id: int = Field(primary_key=True)
    access_token: str
    refresh_token: str


class DailyMetric(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    date_logged: str = Field(default_factory=_today)
    steps: int = 0
    active_minutes: int = 0
    sleep_minutes: int = 0
    resting_heart_rate: Optional[int] = None


class WeightLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int
    weight_lbs: float
    date_logged: str = Field(default_factory=_today)


sqlite_file_name = "biotwin.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
engine = create_engine(sqlite_url, echo=False)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session

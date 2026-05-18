# 🧬 Bio-Twin AI: Real-Time Health Architecture

**Bio-Twin AI** is a full-stack health and fitness "digital twin" that combines
**Gemini multimodal AI**, the **USDA FoodData Central** truth engine, **Fitbit**
wearable sync, and **30-day weight prediction** to turn a single photo or sentence
into a living model of your body.

A Next.js frontend talks to a FastAPI / SQLModel backend that runs the AI
pipeline, fact-checks against government nutrition data, and projects your future
weight using linear regression on calorie balance.

---

## 🚀 Core Features

### 🧠 AI Food Lens (text + photo)
Type *"3 scrambled eggs and sourdough toast"* — or snap a photo — and Gemini
returns calories, protein, carbs, and fat in seconds.

### ⚖️ Truth Engine (USDA Fact-Checking)
Every AI estimate is cross-checked against the **USDA FoodData Central** API.
If the AI's guess is >20% off, the meal is flagged with a `⚠️ AI estimate`
badge so you know not to trust it.

### ⌚ Wearable Sync (Fitbit OAuth2)
Connect your Fitbit once and a single click pulls today's steps, active minutes,
sleep, and resting heart rate. Access tokens auto-refresh on 401.

### 🔥 Streak Gamification
Hit your daily logging goal and your `🔥 streak` counter climbs. Miss a day and
it resets.

### 🤖 AI Coach
The dashboard's coach pulls your **last 7 days** of meals, workouts, sleep and
steps, feeds them to Gemini as a "harsh but fair coach," and shows one concrete
action for tomorrow.

### 📉 30-Day Twin Projection
A `Recharts` line graph plots your historical weight (solid) and the AI's
30-day projection (dashed) based on your average daily calorie balance vs your
Mifflin-St Jeor BMR.

### 🔐 Secure Auth
Google OAuth via `next-auth`. Profile data (weight, height, goal) stored in
SQLModel.

---

## 🛠️ Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, Recharts 3 |
| **Backend** | Python, FastAPI, SQLModel |
| **AI** | Google Gemini 2.5 Flash (text + vision) |
| **Nutrition Data** | USDA FoodData Central API |
| **Wearables** | Fitbit OAuth2 (activity + sleep + HR) |
| **Auth** | NextAuth.js (Google) |
| **DB** | SQLite (dev) / PostgreSQL-ready (prod) |

---

## ⚙️ Local Setup

### 1. Clone
```bash
git clone https://github.com/your-username/bio-twin-ai.git
cd bio-twin-ai
```

### 2. Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate      # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # add your real keys
uvicorn main:app --reload
```

Required env vars (see `.env.example`):
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey
- `USDA_API_KEY` — https://fdc.nal.usda.gov/api-key-signup
- `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` — https://dev.fitbit.com

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Add to `frontend/.env.local`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=any-long-random-string
NEXTAUTH_URL=http://localhost:3000
```

Open `http://localhost:3000`.

---

## 🐳 Docker (backend)

```bash
cd backend
docker build -t biotwin-backend .
docker run -p 8000:8000 --env-file .env biotwin-backend
```

## ☁️ Deployment notes

- **Backend** → Render / Railway / Fly.io (use the included Dockerfile).
- **Frontend** → Vercel (`vercel --prod` from `/frontend`).
- **Database** → swap SQLite for Postgres on Supabase or Neon by changing
  `sqlite_url` in `backend/database.py` to your `DATABASE_URL`.

---

## 🗺️ API Map

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/ai/log-meal/` | Gemini text/image → macro JSON, USDA-verified |
| `POST` | `/meals/` | Manual meal entry |
| `POST` | `/workouts/` | Manual workout entry |
| `POST` | `/api/search-food/` | USDA quick lookup |
| `POST` | `/api/user/` | Upsert profile (weight, height, goal) |
| `POST` | `/api/weight/` | Log a new weight measurement |
| `GET`  | `/api/weight/{user_id}` | Weight history |
| `GET`  | `/api/streak/{user_id}` | Current logging streak |
| `GET`  | `/api/coach/{user_id}` | Gemini-generated 7-day insight |
| `GET`  | `/api/prediction/{user_id}` | 30-day weight projection |
| `GET`  | `/api/metrics/{user_id}` | Fitbit daily metrics |
| `GET`  | `/auth/fitbit/login` | Begin Fitbit OAuth |
| `POST` | `/api/sync-fitbit/{user_id}` | Pull today's Fitbit data |

---

## ✅ Roadmap status

- [x] Phase 1: CRUD core (meals, workouts, dashboard)
- [x] Phase 2: AI text logging + Google auth
- [x] Phase 3: Fitbit OAuth + AI Food Lens (vision)
- [x] Phase 4: USDA truth engine + AI coach
- [x] Phase 5: Streak gamification + linear regression weight prediction + Recharts visual
- [x] Phase 6: Mobile-responsive polish, edge-case handling (non-food images, USDA misses, offline backend)
- [ ] Phase 7: Postgres + Vercel/Render deploy (config included; run yourself)

---

**Bio-Twin AI** — *Digitizing the biological self, one meal at a time.*

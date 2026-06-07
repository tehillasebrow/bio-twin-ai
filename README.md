# 🧬 Bio-Twin AI: Real-Time Health Architecture

**Bio-Twin AI** is a full-stack health and fitness "digital twin" that combines
**Gemini multimodal AI**, the **USDA FoodData Central** truth engine, **Google
Health API** wearable sync, and **30-day weight prediction** to turn a single
photo or sentence into a living model of your body.

A Next.js frontend talks to a FastAPI / SQLModel backend that runs the AI
pipeline, fact-checks against government nutrition data, and projects your future
weight using linear regression on calorie balance.

🔗 **Live demo:** https://bio-twin-ai-rho.vercel.app
⚙️ **API:** https://fitness-ai-b15v.onrender.com

---

## 🚀 Core Features

### 🧠 AI Food Lens (text + photo)
Type *"3 scrambled eggs and sourdough toast"* — or snap a photo — and Gemini
returns calories, protein, carbs, and fat in seconds.

### ⚖️ Truth Engine (USDA Fact-Checking)
Every AI estimate is cross-checked against the **USDA FoodData Central** API.
If the AI's guess is >20% off, the meal is flagged with a `⚠️ AI estimate`
badge so you know not to trust it.

### ⌚ Wearable Sync (Google Health API)
Connect your Google account once and a single click pulls today's steps, active
minutes, sleep, and resting heart rate from the **Google Health API** (the
successor to the retired Fitbit Web API). Access tokens auto-refresh on 401.

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
| **Wearables** | Google Health API (activity + sleep + heart rate) |
| **Auth** | NextAuth.js (Google) |
| **DB** | SQLite (dev) / PostgreSQL via Supabase (prod) |
| **Deploy** | Render (backend, Docker) + Vercel (frontend) |

---

## ⚙️ Local Setup

### 1. Clone
```bash
git clone https://github.com/tehillasebrow/bio-twin-ai.git
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
- `USDA_API_KEY` — https://fdc.nal.usda.gov/api-key-signup *(optional; falls back to `DEMO_KEY`)*
- `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` — a Google Cloud
  OAuth client with the **Google Health API** enabled
  (https://console.cloud.google.com → APIs & Services → Credentials). You can
  reuse the same OAuth client as Google sign-in.
- `DATABASE_URL` *(optional)* — a Postgres connection string for persistence;
  omit to use a local SQLite file.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Add to `frontend/.env.local` (see `frontend/.env.local.example`):
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=any-long-random-string
NEXTAUTH_URL=http://localhost:3000
```

Open `http://localhost:3000`.

---

## ⌚ Google Health API setup (wearable sync)

The old Fitbit Web API was retired and folded into the **Google Health API**.
To enable the "Connect" button:

1. In **Google Cloud Console**, enable the **Google Health API** (APIs & Services
   → Library).
2. On the **Data Access** page, add these read-only scopes:
   - `…/auth/googlehealth.activity_and_fitness.readonly` (steps, active minutes)
   - `…/auth/googlehealth.sleep.readonly` (sleep)
   - `…/auth/googlehealth.health_metrics_and_measurements.readonly` (resting HR)
3. Keep the app in **Testing** mode and add your Google account under
   **Test users** (restricted scopes need this; production requires a security
   review). Note: in Testing mode, refresh tokens expire after 7 days, so you'll
   re-click "Connect" roughly weekly.
4. Under **Credentials → your OAuth client → Authorized redirect URIs**, add the
   backend callback: `https://<your-backend>.onrender.com/auth/fitbit/callback`.
5. Set `GOOGLE_HEALTH_CLIENT_ID` / `GOOGLE_HEALTH_CLIENT_SECRET` on the backend.

> Sync only returns numbers if your Google account actually contains health data
> (from a Fitbit / Pixel Watch / Wear OS device syncing into Google Health).

---

## 🐳 Docker (backend)

```bash
cd backend
docker build -t biotwin-backend .
docker run -p 8000:8000 --env-file .env biotwin-backend
```

## ☁️ Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full step-by-step Render + Vercel
guide. In short:

- **Backend** → Render (Docker, uses the included `backend/Dockerfile`, binds `$PORT`).
- **Frontend** → Vercel (set `NEXT_PUBLIC_API_URL` to your Render URL).
- **Database** → **Supabase Postgres**. Set `DATABASE_URL` to the Supabase
  **Session pooler** connection string (IPv4-compatible — the *direct* connection
  is IPv6-only and won't connect from Render). The backend normalizes the
  `postgres://` scheme to `postgresql://` automatically and creates tables on
  startup.
- All localhost URLs are configurable via env vars
  (`NEXT_PUBLIC_API_URL`, `ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`).

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
| `GET`  | `/api/metrics/{user_id}` | Daily wearable metrics |
| `GET`  | `/auth/fitbit/login` | Begin Google Health OAuth *(legacy path name)* |
| `POST` | `/api/sync-fitbit/{user_id}` | Pull today's Google Health data |

---

## ✅ Roadmap status

- [x] Phase 1: CRUD core (meals, workouts, dashboard)
- [x] Phase 2: AI text logging + Google auth
- [x] Phase 3: Wearable OAuth + AI Food Lens (vision)
- [x] Phase 4: USDA truth engine + AI coach
- [x] Phase 5: Streak gamification + linear regression weight prediction + Recharts visual
- [x] Phase 6: Mobile-responsive polish, edge-case handling (non-food images, USDA misses, offline backend)
- [x] Phase 7: Production deploy — env-var config, Render + Vercel (see DEPLOYMENT.md)
- [x] Phase 8: Migrated wearable sync from the retired Fitbit Web API to the **Google Health API**; persistent **Supabase Postgres**

---

**Bio-Twin AI** — *Digitizing the biological self, one meal at a time.*

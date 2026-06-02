# 🧬 Bio-Twin AI — Project Report

**A real-time health "digital twin" that turns a photo or a sentence into a living model of your body.**

| | |
| :-- | :-- |
| **Author** | *(your name)* |
| **Live demo** | *(your Vercel URL)* |
| **Repository** | *(your GitHub URL)* |
| **Stack** | Next.js 16 · React 19 · FastAPI · SQLModel · Google Gemini 2.5 Flash · USDA FoodData Central · Fitbit OAuth2 |

---

## 1. Overview

Most calorie trackers ask you to scroll through a database and tap a serving size.
Bio-Twin AI removes that friction. You **describe** a meal in plain English, **snap a
photo**, or just **chat** ("I slept 7 hours, did 8,500 steps") — and the app
parses it, fact-checks it, stores it, and folds it into a continuously updated
model of your body: your weight trend, your streak, a coach's daily nudge, and a
30-day projection of where your weight is heading.

The core idea is a **digital twin**: a single, always-current data model of the
user's physiology, fed by three input channels (AI parsing, manual entry,
wearable sync) and surfaced through six analytical views. AI is not a bolt-on
feature here — it is the primary interface and the reasoning engine.

---

## 2. Features

### 🧠 AI Food Lens (text + vision)
Type *"3 scrambled eggs and sourdough toast"* or upload a photo. Gemini 2.5 Flash
identifies the foods, estimates portions, and returns structured macros
(calories, protein, carbs, fat) as strict JSON. Non-food inputs (a car, random
text) are detected and politely rejected via an `is_food` flag.

### ⚖️ Truth Engine (USDA fact-checking)
AI estimates can hallucinate, so every meal's dominant item is cross-checked
against the **USDA FoodData Central** government database. If the AI's calorie
guess is more than **20%** off the USDA value, the meal is flagged with a
`⚠️ AI estimate` badge so the user knows what to trust. This is the project's
defining design choice: **AI for breadth, government data for ground truth.**

### 💬 Conversational logging
A chat interface runs every message through a Gemini **intent classifier** that
decides whether the user is *logging* (sleep, steps, weight, a workout) or just
*chatting* — then writes the right record to the database and replies naturally.
One text box replaces four separate forms.

### 🤖 AI Coach
Pulls the user's **last 7 days** of meals, workouts, and metrics, sends them to
Gemini framed as a "warm but honest coach," and returns a short insight plus one
concrete action for tomorrow — grounded in the user's actual numbers.

### 📉 30-Day Twin Projection
A linear-regression model projects weight 30 days out. It computes average daily
net calorie balance (intake − BMR − activity burn) over a 14-day window, converts
it at **3,500 kcal ≈ 1 lb**, and **clamps the rate to a medically-sane 2 lb/week**.
If calorie history is thin, it falls back to regressing on the raw weight log.
Plotted in Recharts as a solid (historical) + dashed (projected) line.

### ⌚ Wearable Sync (Fitbit OAuth2)
Connect a Fitbit once; one click pulls today's steps, active minutes, sleep, and
resting heart rate. Access tokens **auto-refresh on a 401** and retry transparently.

### 🔥 Streak gamification
Logging at least one meal on consecutive days climbs a `🔥 streak` counter; a
missed day resets it.

### 🔐 Secure auth
Google sign-in via NextAuth. Profile data (weight, height, calorie goal) is stored
in SQLModel.

---

## 3. Architecture

```
┌──────────────────────────┐         ┌───────────────────────────────┐
│  Next.js 16 / React 19   │  HTTPS  │  FastAPI  (Python)            │
│  (Vercel)                │ ──────► │  (Render, Docker)            │
│                          │         │                               │
│  • AI Lens form          │         │  /ai/log-meal/  ── Gemini ──┐ │
│  • Chat box              │         │  /api/chat/     ── Gemini ──┤ │
│  • Coach / Prediction    │         │  /api/coach/    ── Gemini ──┤ │
│  • Recharts twin chart   │         │  Truth Engine  ── USDA ─────┤ │
│  • Fitbit card           │         │  /api/prediction ─ regression │
│  NextAuth (Google)       │         │  Fitbit OAuth2 ── refresh ───┘ │
└──────────────────────────┘         │  SQLModel ORM → SQLite/Postgres│
                                      └───────────────────────────────┘
```

- **Frontend** is a single-page dashboard. All backend calls go through one
  configurable base URL (`NEXT_PUBLIC_API_URL`), so the same build runs locally
  or in production unchanged.
- **Backend** is a stateless FastAPI app. Six SQLModel tables — `User`, `Meal`,
  `Workout`, `DailyMetric`, `WeightLog`, `UserToken` — model the twin. The DB layer
  reads `DATABASE_URL`, defaulting to SQLite for dev and accepting Postgres for prod
  without code changes.
- **External services:** Gemini (reasoning/vision), USDA FDC (nutrition truth),
  Fitbit (wearable data), Google (identity).

### Notable engineering details
- **Resilient JSON parsing** — `parse_gemini_json()` extracts a JSON object whether
  the model returns it raw or fenced in a ```` ```json ```` block.
- **Graceful degradation** — USDA failures, offline AI, and missing data each
  return sane fallbacks instead of crashing (e.g. the coach returns "Coach is
  offline" rather than a 500).
- **Safety clamp** — the weight predictor refuses to project medically implausible
  rates, capping at 0.286 lb/day.
- **Token refresh loop** — Fitbit calls retry once after refreshing an expired
  access token, transparent to the user.

---

## 4. Tech stack

| Layer | Technology | Why |
| :-- | :-- | :-- |
| Frontend | Next.js 16, React 19, Tailwind 4 | Fast SPA, file-based routing, utility styling |
| Charts | Recharts 3 | Declarative line charts for the twin projection |
| Auth | NextAuth.js (Google) | Drop-in OAuth, session management |
| Backend | FastAPI, SQLModel, Pydantic | Typed, async-friendly API with ORM + validation in one |
| AI | Google Gemini 2.5 Flash | Multimodal (text + vision), fast, structured-output capable |
| Nutrition truth | USDA FoodData Central API | Authoritative, free government nutrition data |
| Wearables | Fitbit Web API (OAuth2) | Activity, sleep, heart-rate |
| DB | SQLite (dev) / Postgres-ready (prod) | Zero-config locally, scalable in prod |
| Deploy | Vercel (frontend) + Render Docker (backend) | Git-push deploys on both halves |

---

## 5. How I used AI to develop this project

> *Edit this section to match your actual workflow — the structure and examples below
> reflect how the codebase was built and are a strong starting point.*

AI shows up in this project in **two distinct roles**, and it's worth separating them.

### 5a. AI inside the product (the runtime)
Gemini 2.5 Flash is the reasoning engine the app ships with. I used it for three
genuinely different jobs rather than one generic "chatbot":
1. **Multimodal extraction** — turning unstructured input (a sentence or a food
   photo) into strict, schema-constrained JSON macros.
2. **Intent classification** — routing free-text chat to the correct database write.
3. **Grounded summarization** — coaching on real 7-day data, instructed to cite the
   user's actual numbers.

A key lesson was that **LLM output needs guardrails**: I constrained every prompt to
"return ONLY valid JSON in this exact shape," wrote a tolerant parser for when the
model wrapped it in markdown anyway, and — most importantly — added the **USDA Truth
Engine** so a hallucinated calorie count gets caught and flagged instead of silently
trusted. "AI proposes, government data verifies" became the guiding principle.

### 5b. AI as my development partner (the build)
I used an AI coding assistant throughout the build as a pair programmer. Concretely:

- **Scaffolding & boilerplate** — generating the FastAPI route stubs, SQLModel table
  definitions, and React component shells, which I then refined.
- **Prompt engineering** — iterating on the Gemini prompts (the JSON-shape
  instructions, the coach persona, the intent classifier rules) much faster than I
  could by hand, testing edge cases like non-food images and hours-to-minutes sleep
  conversion.
- **Debugging** — diagnosing CORS errors, the Gemini fenced-JSON parsing issue, and
  the Fitbit 401 token-refresh flow.
- **Hardening for deploy** — the assistant identified that the frontend had the
  backend URL hardcoded in ~8 places and that CORS/Fitbit redirects were locked to
  localhost, then refactored them behind environment variables
  (`NEXT_PUBLIC_API_URL`, `ALLOWED_ORIGINS`, `BACKEND_URL`, `FRONTEND_URL`) so the
  app could actually run in production.
- **Documentation** — drafting this report, the README, and the deployment guide.

**What I learned working this way:** AI is excellent at breadth and speed, but the
*architecture decisions* — the digital-twin data model, the truth-engine concept, the
medically-sane prediction clamp — were mine to make and verify. The most valuable
skill was reviewing and correcting AI output, not just accepting it: the same
"trust but verify" stance the app applies to Gemini's nutrition guesses, I applied to
the AI's code.

---

## 6. Roadmap

- [x] CRUD core (meals, workouts, dashboard)
- [x] AI text logging + Google auth
- [x] Fitbit OAuth + AI Food Lens (vision)
- [x] USDA truth engine + AI coach
- [x] Streak gamification + weight prediction + Recharts visual
- [x] Mobile-responsive polish, edge-case handling
- [x] **Production deploy** (env-var config, Render + Vercel)
- [ ] Multi-user data isolation (currently single-user demo, `USER_ID = 1`)
- [ ] Persistent Postgres + historical Fitbit backfill
- [ ] Photo storage off-row (currently base64 in DB)

---

## 7. Known limitations (honest accounting)

- **Single-user demo** — the frontend hard-codes `USER_ID = 1`; auth gates access but
  all data shares one profile. Real multi-tenancy is the next step.
- **Ephemeral storage on free tier** — SQLite resets on redeploy unless Postgres is
  attached (code already supports `DATABASE_URL`).
- **Prediction is a heuristic**, not a clinical model — a clamped linear regression on
  calorie balance, intended to be motivational, not medical advice.
- **Fitbit token is stored for `user_id = 1`** in the OAuth callback — fine for the
  demo, would be tied to the session in a multi-user build.

---

*Bio-Twin AI — digitizing the biological self, one meal at a time.*

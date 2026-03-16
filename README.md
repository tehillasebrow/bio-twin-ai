# 🧬 Bio-Twin AI: Real-Time Health Architecture

**Bio-Twin AI** is a full-stack health and fitness dashboard that uses **Gemini 3.1 Flash Lite** to bridge the gap between raw human activity and actionable data. By combining a Next.js frontend with a FastAPI/SQLModel backend, Bio-Twin allows users to log meals in plain English and receive instant nutritional breakdowns.

---

## 🚀 Core Features

### 🧠 AI Food Lens
Stop manual calorie counting. Type "3 scrambled eggs and a slice of sourdough toast" and our custom-tuned Gemini engine extracts:
* **Calories** (kcal)
* **Macros** (Protein, Carbs, Fat in grams)
* **Real-time Database Injection**

### ⚡ Activity Log
Track physical exertion with a manual workout logger. It calculates estimated calorie burn and updates your daily net energy balance instantly.

### 📊 Live Macro Dashboard
* **Dynamic Progress HUD:** Animated SVG/CSS gauges that track your daily intake against custom goals (2500 kcal, 150g Protein, etc.).
* **Persistent History:** A scrolling, "newest-first" timeline of your nutritional and physical activity.
* **Full CRUD Support:** Hover-to-delete functionality to keep your data clean and accurate.

### 🔐 Secure Architecture
* **Google OAuth 2.0:** Secure authentication via `next-auth`.
* **Database Integrity:** SQLModel/SQLite backend ensuring data persistence.
* **Robust Error Handling:** Integrated retry loops to manage AI API rate limits (429 errors) and sanitize JSON responses.

---

## 🛠️ Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 14, React, Tailwind CSS |
| **Backend** | Python, FastAPI, SQLModel |
| **Intelligence** | Google Gemini 3.1 Flash Lite Preview |
| **Auth** | NextAuth.js (Google Provider) |
| **Database** | SQLite |

---

## ⚙️ Installation & Setup

### 1. Clone the Architecture
`git clone https://github.com/your-username/bio-twin-ai.git`
`cd bio-twin-ai`

### 2. Backend Configuration
`cd backend`
`python -m venv venv`
`source venv/bin/activate` *(Or `.\venv\Scripts\Activate` on Windows)*
`pip install -r requirements.txt`
*Add your `GEMINI_API_KEY` to a `.env` file*
`uvicorn main:app --reload`

### 3. Frontend Configuration
`cd frontend`
`npm install`
`npm run dev`

Navigate to `http://localhost:3000` to initialize the core.

---

## 📈 Developmental Milestones

* [x] Integrated Google OAuth 2.0.
* [x] Migrated to modern `google-genai` SDK for Gemini 3.1.
* [x] Implemented Real-time Macro calculation and progress HUD.
* [x] Added full CRUD operations for meal and workout history.
* [ ] *Next:* Weekly average analytics and biometric trend charts.

---

**Bio-Twin AI** — *Digitizing the biological self, one meal at a time.*

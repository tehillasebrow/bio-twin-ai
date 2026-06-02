# 🚀 Deploying Bio-Twin AI (Render + Vercel)

This guide takes you from a local project to a live URL. The backend (FastAPI)
runs on **Render** as a Docker service; the frontend (Next.js) runs on **Vercel**.

> The code has already been made deploy-ready: every frontend call goes through
> `NEXT_PUBLIC_API_URL`, the backend CORS / Fitbit URLs read from env vars, and
> the Dockerfile binds Render's `$PORT`. You only need to set environment
> variables and click deploy.

---

## 0. Prerequisites (15 min, one-time)

Gather these before you start — you'll paste them into Render/Vercel later:

| Key | Where to get it |
| :-- | :-- |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `USDA_API_KEY` | https://fdc.nal.usda.gov/api-key-signup (optional — falls back to `DEMO_KEY`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com → APIs & Services → Credentials → OAuth client |
| `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` | https://dev.fitbit.com (optional — only if you demo wearable sync) |
| `NEXTAUTH_SECRET` | run `openssl rand -base64 32` (or any long random string) |

Also: push this repo to **GitHub** (Render and Vercel both deploy from a repo).

```bash
git add .
git commit -m "Make app deploy-ready"
git push origin main
```

---

## 1. Deploy the backend to Render

1. Go to https://dashboard.render.com → **New** → **Web Service**.
2. Connect your GitHub repo and select it.
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Docker (Render auto-detects `backend/Dockerfile`)
   - **Instance type:** Free
4. Under **Environment**, add these variables (leave `FRONTEND_URL` / `ALLOWED_ORIGINS`
   as placeholders for now — you'll fix them in step 3):

   | Key | Value |
   | :-- | :-- |
   | `GEMINI_API_KEY` | *(your key)* |
   | `USDA_API_KEY` | *(your key)* |
   | `FITBIT_CLIENT_ID` | *(your key, optional)* |
   | `FITBIT_CLIENT_SECRET` | *(your key, optional)* |
   | `ALLOWED_ORIGINS` | `http://localhost:3000` *(updated in step 3)* |
   | `FRONTEND_URL` | `http://localhost:3000` *(updated in step 3)* |
   | `BACKEND_URL` | *(set after first deploy — see below)* |

5. Click **Create Web Service**. Wait for the build (~3–5 min).
6. Render gives you a URL like `https://bio-twin-ai.onrender.com`. **Copy it.**
7. Set `BACKEND_URL` to that exact URL and save (triggers a quick redeploy).
8. Verify: open `https://bio-twin-ai.onrender.com/` — you should see
   `{"status":"Bio-Twin AI backend running"}`.

> **Note on data:** the free tier uses an ephemeral SQLite file — data resets on
> each redeploy/sleep. That's fine for a demo. To persist, add a Render Postgres
> instance and set `DATABASE_URL` to its Internal Connection String (the code
> already reads it).

> **Note on cold starts:** free Render services sleep after 15 min idle; the
> first request after sleeping takes ~30–50s. Hit the URL once right before you
> record your demo.

---

## 2. Deploy the frontend to Vercel

1. Go to https://vercel.com → **Add New** → **Project** → import the same repo.
2. Configure:
   - **Root Directory:** `frontend`
   - Framework preset: **Next.js** (auto-detected)
3. Add **Environment Variables**:

   | Key | Value |
   | :-- | :-- |
   | `NEXT_PUBLIC_API_URL` | your Render URL, e.g. `https://bio-twin-ai.onrender.com` |
   | `GOOGLE_CLIENT_ID` | *(your key)* |
   | `GOOGLE_CLIENT_SECRET` | *(your key)* |
   | `NEXTAUTH_SECRET` | *(your random string)* |
   | `NEXTAUTH_URL` | *(your Vercel URL — see below)* |

4. Click **Deploy**. Vercel gives you a URL like
   `https://bio-twin-ai.vercel.app`.
5. Set `NEXTAUTH_URL` to that exact Vercel URL, then **redeploy**
   (Deployments → ⋯ → Redeploy). NextAuth needs this to build correct callbacks.

---

## 3. Wire the two halves together

Now that both URLs exist, fix the placeholders:

1. **Render** → your service → Environment, update:
   - `ALLOWED_ORIGINS` → `https://bio-twin-ai.vercel.app` (your Vercel URL, no trailing slash)
   - `FRONTEND_URL` → `https://bio-twin-ai.vercel.app`
   - Save (redeploys automatically).

2. **Google OAuth** → Cloud Console → your OAuth client → add:
   - **Authorized JavaScript origins:** `https://bio-twin-ai.vercel.app`
   - **Authorized redirect URIs:** `https://bio-twin-ai.vercel.app/api/auth/callback/google`

3. **Fitbit** (only if using it) → dev.fitbit.com → your app settings:
   - **Redirect URL:** `https://bio-twin-ai.onrender.com/auth/fitbit/callback`
   - **OAuth 2.0 Application Type:** Server

---

## 4. Smoke test the live app

Open your Vercel URL and verify, in order:

- [ ] Page loads, "Sign in with Google" works.
- [ ] Set up profile (weight/height/goal) → saves without error.
- [ ] AI Lens: type "2 eggs and toast" → returns calories/macros.
- [ ] Chat: "I slept 7 hours" → logs a metric.
- [ ] Coach card generates an insight.
- [ ] Prediction card + Twin chart render after a couple of logs.
- [ ] (Optional) Fitbit Connect → authorize → Sync today.

If a call fails, open the browser devtools **Network** tab: a CORS error means
`ALLOWED_ORIGINS` doesn't exactly match your Vercel URL; a 502/timeout usually
means Render is waking from sleep — retry once.

---

## Quick reference: environment variables

**Render (backend)**
```
GEMINI_API_KEY, USDA_API_KEY, FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET,
ALLOWED_ORIGINS, BACKEND_URL, FRONTEND_URL, [DATABASE_URL]
```

**Vercel (frontend)**
```
NEXT_PUBLIC_API_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
NEXTAUTH_SECRET, NEXTAUTH_URL
```

"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import CoachCard from "../components/CoachCard";
import StreakBadge from "../components/StreakBadge";
import PredictionCard from "../components/PredictionCard";
import TwinChart from "../components/TwinChart";
import FitbitCard from "../components/FitbitCard";
import ProfileSetup from "../components/ProfileSetup";
import ChatBox from "../components/ChatBox";
import ManualMetricsCard from "../components/ManualMetricsCard";
import { API_URL } from "../lib/api";

const API = API_URL;
const USER_ID = 1; // single-user demo

export default function Home() {
  const { data: session } = useSession();

  const [status, setStatus] = useState("");
  const [mealHistory, setMealHistory] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [dailyTotals, setDailyTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  const [user, setUser] = useState(null);
  const [streak, setStreak] = useState(0);
  const [goal, setGoal] = useState(2500);
  const [metrics, setMetrics] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Form states
  const [aiMealDesc, setAiMealDesc] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [manual, setManual] = useState({
    desc: "",
    cals: "",
    pro: "",
    carbs: "",
    fat: "",
  });
  const [workout, setWorkout] = useState({ type: "", duration: "" });
  const [newWeight, setNewWeight] = useState("");

  const showStatus = (msg, ms = 2500) => {
    setStatus(msg);
    setTimeout(() => setStatus(""), ms);
  };

  const refreshData = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const [mRes, wRes, sRes, uRes, mtRes, whRes] = await Promise.all([
        fetch(`${API}/meals/`),
        fetch(`${API}/workouts/`),
        fetch(`${API}/api/streak/${USER_ID}`),
        fetch(`${API}/api/user/${USER_ID}`),
        fetch(`${API}/api/metrics/${USER_ID}`),
        fetch(`${API}/api/weight/${USER_ID}`),
      ]);

      if (mRes.ok) {
        const allMeals = await mRes.json();
        const userMeals = allMeals.filter((m) => m.user_id === USER_ID);
        const todays = userMeals.filter((m) => m.date_logged === today);
        setMealHistory(todays.reverse());
        setDailyTotals(
          todays.reduce(
            (acc, m) => ({
              calories: acc.calories + (m.calories || 0),
              protein: acc.protein + (m.protein_g || 0),
              carbs: acc.carbs + (m.carbs_g || 0),
              fat: acc.fat + (m.fat_g || 0),
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 }
          )
        );
      }
      if (wRes.ok) {
        const all = await wRes.json();
        setWorkoutHistory(
          all
            .filter((w) => w.user_id === USER_ID && w.date_logged === today)
            .reverse()
        );
      }
      if (sRes.ok) {
        const s = await sRes.json();
        setStreak(s.streak ?? 0);
        setGoal(s.goal ?? 2500);
      }
      if (uRes.ok) setUser(await uRes.json());
      if (mtRes.ok) setMetrics(await mtRes.json());
      if (whRes.ok) {
        const wh = await whRes.json();
        setWeightHistory(
          wh.map((w) => ({ date: w.date_logged, weight: w.weight_lbs }))
        );
      }

      // Prediction (silently skipped if user has no weight yet)
      try {
        const pRes = await fetch(`${API}/api/prediction/${USER_ID}?days_ahead=30`);
        if (pRes.ok) setPrediction(await pRes.json());
        else setPrediction(null);
      } catch (_) {
        setPrediction(null);
      }

      setRefreshKey((k) => k + 1);
    } catch (_) {
      showStatus("⚠️ Backend offline");
    }
  }, []);

  useEffect(() => {
    if (session) {
      // Ensure user record exists with the signed-in email
      fetch(`${API}/api/user/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          email: session.user?.email || "user@local",
          name: session.user?.name,
        }),
      }).finally(refreshData);
    }
  }, [session, refreshData]);

  // ----- handlers -----
  const handleAILog = async (e) => {
    e.preventDefault();
    if (!aiMealDesc && !imageFile) {
      showStatus("Add a description or photo first");
      return;
    }
    showStatus("🧠 AI analyzing...");
    let base64 = null;
    if (imageFile) {
      base64 = await new Promise((r) => {
        const reader = new FileReader();
        reader.onload = () => r(reader.result.split(",")[1]);
        reader.readAsDataURL(imageFile);
      });
    }
    try {
      const res = await fetch(`${API}/ai/log-meal/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          description: aiMealDesc,
          image_base64: base64,
        }),
      });
      if (res.ok) {
        showStatus("✅ Logged");
        setAiMealDesc("");
        setImageFile(null);
        await refreshData();
      } else {
        const e = await res.json();
        showStatus(`⚠️ ${e.detail || "Could not log"}`, 4000);
      }
    } catch (_) {
      showStatus("⚠️ Backend offline");
    }
  };

  const handleUSDASearch = async () => {
    if (!manual.desc) return;
    try {
      const res = await fetch(`${API}/api/search-food/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: manual.desc }),
      });
      if (res.ok) {
        const data = await res.json();
        setManual({
          ...manual,
          desc: data.name,
          cals: data.calories,
          pro: data.protein,
          carbs: data.carbs,
          fat: data.fat,
        });
        showStatus("✅ USDA matched");
      } else {
        showStatus("⚠️ No USDA match");
      }
    } catch (_) {
      showStatus("⚠️ Backend offline");
    }
  };

  const logManual = async (e) => {
    e.preventDefault();
    if (!manual.desc) return;
    const res = await fetch(`${API}/meals/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        description: manual.desc,
        calories: +manual.cals || 0,
        protein_g: +manual.pro || 0,
        carbs_g: +manual.carbs || 0,
        fat_g: +manual.fat || 0,
      }),
    });
    if (res.ok) {
      setManual({ desc: "", cals: "", pro: "", carbs: "", fat: "" });
      showStatus("✅ Logged");
      await refreshData();
    }
  };

  const logWorkout = async (e) => {
    e.preventDefault();
    if (!workout.type || !workout.duration) return;
    const res = await fetch(`${API}/workouts/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        type: workout.type,
        duration_minutes: +workout.duration,
        calories_burned: +workout.duration * 10,
      }),
    });
    if (res.ok) {
      setWorkout({ type: "", duration: "" });
      showStatus("✅ Logged");
      await refreshData();
    }
  };

  const logWeight = async (e) => {
    e.preventDefault();
    if (!newWeight) return;
    await fetch(`${API}/api/weight/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, weight_lbs: +newWeight }),
    });
    setNewWeight("");
    showStatus("✅ Weight logged");
    await refreshData();
  };

  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 flex flex-col items-center justify-center px-6 text-white">
        <div className="text-center max-w-md">
          <h1 className="text-5xl sm:text-6xl font-black mb-3 tracking-tight">
            🧬 Bio-Twin AI
          </h1>
          <p className="text-slate-300 mb-10">
            Your personal AI fitness coach, calorie engine, and 30-day weight
            projector — all from a single tap or photo.
          </p>
          <button
            onClick={() => signIn("google")}
            className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold hover:bg-slate-100 transition"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  const pct = Math.min(100, (dailyTotals.calories / goal) * 100);

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 bg-white p-5 sm:p-6 rounded-3xl shadow-sm">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-violet-600">
            🧬 Bio-Twin AI
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {session.user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProfileSetup
            userId={USER_ID}
            email={session.user?.email}
            onSaved={refreshData}
          />
          <button onClick={() => signOut()} className="text-xs text-slate-400">
            Sign out
          </button>
        </div>
      </header>

      {/* Top metrics row */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {["calories", "protein", "carbs", "fat"].map((k) => (
          <div
            key={k}
            className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100"
          >
            <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-400 tracking-wider">
              {k}
            </span>
            <p className="text-xl sm:text-2xl font-black">
              {Math.round(dailyTotals[k])}
              {k === "calories" && (
                <span className="text-xs font-normal text-slate-400">
                  {" "}
                  / {goal}
                </span>
              )}
            </p>
            {k === "calories" && (
              <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-violet-600 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Coach + Streak + Prediction row */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <CoachCard userId={USER_ID} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
          <StreakBadge streak={streak} />
          <PredictionCard prediction={prediction} />
        </div>
      </section>

      {/* Chart + Fitbit */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-slate-900 text-white p-5 sm:p-6 rounded-3xl shadow-lg">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-3 gap-2">
            <h3 className="font-bold">Twin Projection · 30 days</h3>
            <form onSubmit={logWeight} className="flex gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Log weight"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="px-3 py-1 text-xs rounded-xl bg-slate-800 text-white w-28"
              />
              <button className="px-3 py-1 text-xs rounded-xl bg-violet-600 font-bold">
                Add
              </button>
            </form>
          </div>
          <TwinChart history={weightHistory} prediction={prediction} />
        </div>
        <FitbitCard
          metrics={metrics}
          userId={USER_ID}
          onSync={refreshData}
        />
      </section>

      {/* Chat + Manual Metrics */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ChatBox userId={USER_ID} onLogged={refreshData} />
        </div>
        <ManualMetricsCard
          userId={USER_ID}
          todayMetric={
            metrics && metrics.length
              ? metrics.filter(
                  (m) =>
                    m.date_logged === new Date().toISOString().split("T")[0]
                )[0]
              : null
          }
          onSaved={refreshData}
        />
      </section>

      {/* Logging forms */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <form
          onSubmit={handleAILog}
          className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-bold mb-3">🧠 AI Lens</h2>
          <textarea
            className="w-full p-3 bg-slate-50 rounded-2xl mb-3 h-20 text-sm"
            placeholder="What's for dinner?"
            value={aiMealDesc}
            onChange={(e) => setAiMealDesc(e.target.value)}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="mb-3 text-xs w-full"
          />
          <button className="w-full py-3 bg-violet-600 text-white font-bold rounded-2xl hover:bg-violet-700 transition">
            Analyze Intake
          </button>
        </form>

        <form
          onSubmit={logManual}
          className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-bold mb-3">⚖️ Truth Engine</h2>
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 p-3 bg-slate-50 rounded-xl text-sm"
              placeholder="Search USDA..."
              value={manual.desc}
              onChange={(e) =>
                setManual({ ...manual, desc: e.target.value })
              }
            />
            <button
              type="button"
              onClick={handleUSDASearch}
              className="px-3 bg-blue-100 text-blue-600 rounded-xl font-bold text-sm"
            >
              Search
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="number"
              placeholder="Cals"
              className="p-2.5 bg-slate-50 rounded-xl text-sm"
              value={manual.cals}
              onChange={(e) => setManual({ ...manual, cals: e.target.value })}
            />
            <input
              type="number"
              placeholder="Pro (g)"
              className="p-2.5 bg-slate-50 rounded-xl text-sm"
              value={manual.pro}
              onChange={(e) => setManual({ ...manual, pro: e.target.value })}
            />
            <input
              type="number"
              placeholder="Carbs (g)"
              className="p-2.5 bg-slate-50 rounded-xl text-sm"
              value={manual.carbs}
              onChange={(e) =>
                setManual({ ...manual, carbs: e.target.value })
              }
            />
            <input
              type="number"
              placeholder="Fat (g)"
              className="p-2.5 bg-slate-50 rounded-xl text-sm"
              value={manual.fat}
              onChange={(e) => setManual({ ...manual, fat: e.target.value })}
            />
          </div>
          <button className="w-full py-3 border-2 border-blue-600 text-blue-600 font-bold rounded-2xl hover:bg-blue-50 transition">
            Log Exact Macros
          </button>
        </form>

        <form
          onSubmit={logWorkout}
          className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-bold mb-3">⚡ Activity</h2>
          <input
            className="w-full p-3 bg-slate-50 rounded-2xl mb-3 text-sm"
            placeholder="Workout type..."
            value={workout.type}
            onChange={(e) =>
              setWorkout({ ...workout, type: e.target.value })
            }
          />
          <input
            type="number"
            className="w-full p-3 bg-slate-50 rounded-2xl mb-3 text-sm"
            placeholder="Minutes"
            value={workout.duration}
            onChange={(e) =>
              setWorkout({ ...workout, duration: e.target.value })
            }
          />
          <button className="w-full py-3 bg-orange-500 text-white font-bold rounded-2xl hover:bg-orange-600 transition">
            Log Exertion
          </button>
        </form>
      </section>

      {/* History */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm">
          <h3 className="font-bold mb-4 border-b pb-3">Today's Nutrition</h3>
          {mealHistory.length === 0 && (
            <p className="text-sm text-slate-400">No meals yet.</p>
          )}
          <div className="space-y-3">
            {mealHistory.map((m, i) => (
              <div
                key={i}
                className="flex gap-3 items-center p-3 bg-slate-50 rounded-2xl"
              >
                {m.image_data && (
                  <img
                    src={`data:image/jpeg;base64,${m.image_data}`}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                    alt=""
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{m.description}</p>
                  <p className="text-xs text-slate-400">
                    {m.calories} kcal · {Math.round(m.protein_g)}p ·{" "}
                    {Math.round(m.carbs_g)}c · {Math.round(m.fat_g)}f
                  </p>
                  <div className="flex gap-1 mt-1">
                    {m.usda_verified && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                        ✓ USDA
                      </span>
                    )}
                    {m.ai_estimate_flagged && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                        ⚠️ AI estimate
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm">
          <h3 className="font-bold mb-4 border-b pb-3">Today's Activity</h3>
          {workoutHistory.length === 0 && (
            <p className="text-sm text-slate-400">No workouts yet.</p>
          )}
          {workoutHistory.map((w, i) => (
            <div
              key={i}
              className="p-3 bg-slate-50 rounded-2xl mb-2 flex justify-between items-center"
            >
              <span className="text-sm font-medium">{w.type}</span>
              <span className="font-bold text-orange-500 text-sm">
                {w.duration_minutes} min · {w.calories_burned} kcal
              </span>
            </div>
          ))}
        </div>
      </section>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold z-40">
          {status}
        </div>
      )}
    </main>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  // 1. Authentication & UI Status State
  const { data: session, status: authStatus } = useSession();
  const [status, setStatus] = useState("");
  
  // 2. Form State (Meals & Images)
  const [aiMealDesc, setAiMealDesc] = useState("");
  const [imageFile, setImageFile] = useState(null); 

  // 3. Form State (Workouts)
  const [workoutType, setWorkoutType] = useState("");
  const [duration, setDuration] = useState("");

  // 4. Data History & Dashboard State
  const [mealHistory, setMealHistory] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [dailyTotals, setDailyTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });

  // Daily Nutritional Goals
  const goals = {
    calories: 2500,
    protein: 150,
    carbs: 300,
    fat: 70
  };

  // --- SYNC ENGINE ---
  const refreshDailyStats = async () => {
    try {
      // Fetch Meals
      const mealRes = await fetch("http://127.0.0.1:8000/meals/");
      if (mealRes.ok) {
        const meals = await mealRes.json();
        setMealHistory([...meals].reverse()); 
        
        const totals = meals.reduce((acc, meal) => ({
          calories: acc.calories + (meal.calories || 0),
          protein: acc.protein + (meal.protein_g || 0),
          carbs: acc.carbs + (meal.carbs_g || 0),
          fat: acc.fat + (meal.fat_g || 0),
        }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

        setDailyTotals(totals);
      }

      // Fetch Workouts
      const workoutRes = await fetch("http://127.0.0.1:8000/workouts/");
      if (workoutRes.ok) {
        const workouts = await workoutRes.json();
        setWorkoutHistory([...workouts].reverse());
      }
    } catch (error) {
      console.error("Sync Error:", error);
    }
  };

  useEffect(() => {
    if (session) {
      refreshDailyStats();
    }
  }, [session]);

  // --- DELETE LOGIC ---
  const deleteMeal = async (id) => {
    if (!confirm("Remove this meal?")) return;
    const res = await fetch(`http://127.0.0.1:8000/meals/${id}`, { method: "DELETE" });
    if (res.ok) refreshDailyStats();
  };

  const deleteWorkout = async (id) => {
    if (!confirm("Remove this workout?")) return;
    const res = await fetch(`http://127.0.0.1:8000/workouts/${id}`, { method: "DELETE" });
    if (res.ok) refreshDailyStats();
  };

  // --- AI LOGGING LOGIC (TEXT + IMAGE) ---
  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });

  const handleAILogMeal = async (e) => {
    e.preventDefault();
    setStatus("🧠 AI is analyzing your food...");
    
    let base64String = null;
    if (imageFile) {
      const fullBase64 = await toBase64(imageFile);
      base64String = fullBase64.split(",")[1]; 
    }

    const payload = {
      user_id: 1, 
      description: aiMealDesc || "Analyze the food in this image.",
      image_base64: base64String
    };

    try {
      const response = await fetch("http://127.0.0.1:8000/ai/log-meal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(`✅ AI Logged: ${data.calories} kcal | P: ${data.protein_g}g C: ${data.carbs_g}g F: ${data.fat_g}g`);
        setAiMealDesc(""); 
        setImageFile(null); 
        
        // Clear the file input visually in the DOM
        const fileInput = document.getElementById("image-upload");
        if (fileInput) fileInput.value = "";

        refreshDailyStats(); // Sync the dashboard
      } else {
        setStatus("❌ AI analysis failed.");
      }
    } catch (error) {
      setStatus("❌ Connection to backend failed.");
    }
  };

  // --- WORKOUT LOGGING LOGIC ---
  const handleLogWorkout = async (e) => {
    e.preventDefault();
    setStatus("Recording activity...");
    
    try {
      const response = await fetch("http://127.0.0.1:8000/workouts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: 1, 
          type: workoutType,
          duration_minutes: parseInt(duration),
          calories_burned: parseInt(duration) * 10 
        }),
      });

      if (response.ok) {
        setStatus("✅ Workout successfully recorded!");
        setWorkoutType(""); 
        setDuration(""); 
        refreshDailyStats();
      }
    } catch (error) {
      setStatus("❌ Connection to backend failed.");
    }
  };

  // --- UI RENDER LOGIC ---
  if (authStatus === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-black text-green-500 font-mono animate-pulse">SYNCING CORE...</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black p-24 font-mono text-green-400">
        <div className="z-10 max-w-5xl w-full border border-green-500 p-12 rounded-2xl bg-gray-900 text-center shadow-[0_0_20px_rgba(34,197,94,0.2)]">
          <h1 className="text-5xl font-black mb-6 tracking-tighter">BIO-TWIN AI</h1>
          <p className="text-gray-400 mb-8 max-w-sm mx-auto">Access your biometric twin and nutritional architecture.</p>
          <button onClick={() => signIn("google")} className="px-8 py-4 bg-white text-black font-bold rounded-lg hover:invert transition-all flex items-center gap-3 mx-auto">
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center py-12 bg-black font-mono text-green-400 px-4">
      
      {/* HEADER */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-10 border-b border-green-900 pb-6">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">BIO-TWIN AI</h1>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-500 uppercase">Authenticated</p>
            <p className="font-bold text-white text-sm">{session.user.name}</p>
          </div>
          {session.user.image && (
            <img 
              src={session.user.image} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border-2 border-green-500"
            />
          )}
          <button onClick={() => signOut()} className="px-3 py-1 text-xs border border-red-900 text-red-500 rounded hover:bg-red-950 transition-colors">Log Out</button>
        </div>
      </div>

      {/* DASHBOARD GAUGES */}
      <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {Object.keys(goals).map((key) => {
          const current = dailyTotals[key];
          const goal = goals[key];
          const pct = Math.min((current / goal) * 100, 100);
          return (
            <div key={key} className="bg-gray-900/50 border border-green-900 p-4 rounded-xl flex flex-col justify-center">
              <div className="flex justify-between mb-2">
                <span className="text-[10px] uppercase text-gray-500 font-bold">{key}</span>
                <span className="text-xs text-white">{Math.round(current)}/{goal}</span>
              </div>
              <div className="w-full bg-black h-1.5 rounded-full border border-green-950 overflow-hidden">
                <div 
                  className="h-full bg-green-500 shadow-[0_0_10px_#22c55e] transition-all duration-700"
                  style={{ width: `${pct}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT TOOLS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mb-10">
        
        <form onSubmit={handleAILogMeal} className="border border-green-500 p-6 rounded-2xl bg-gray-900 shadow-xl flex flex-col">
          <h2 className="text-xl mb-4 border-b border-green-900 pb-2">🧠 AI Food Lens</h2>
          
          <textarea 
            placeholder="What did you eat? (Or upload an image)"
            className="w-full p-4 bg-black border border-green-900 rounded-lg text-white mb-3 h-24 resize-none focus:border-green-400 outline-none"
            value={aiMealDesc} onChange={(e) => setAiMealDesc(e.target.value)}
          />
          
          {/* THE NEW FILE INPUT */}
          <input 
            id="image-upload"
            type="file" 
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
            className="mb-4 text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-green-900 file:text-green-400 hover:file:bg-green-800 cursor-pointer"
          />

          <button className="mt-auto w-full py-3 bg-green-600 text-black font-black rounded-lg hover:bg-green-400 transition-colors">PROCESS INTAKE</button>
        </form>

        <form onSubmit={handleLogWorkout} className="border border-green-500 p-6 rounded-2xl bg-gray-900 shadow-xl flex flex-col">
          <h2 className="text-xl mb-4 border-b border-green-900 pb-2">⚡ Activity Log</h2>
          <input 
            type="text" required placeholder="Activity (e.g. Boxing)" 
            className="w-full p-4 bg-black border border-green-900 rounded-lg text-white mb-3 focus:border-green-400 outline-none"
            value={workoutType} onChange={(e) => setWorkoutType(e.target.value)}
          />
          <input 
            type="number" required placeholder="Minutes" 
            className="w-full p-4 bg-black border border-green-900 rounded-lg text-white mb-3 focus:border-green-400 outline-none"
            value={duration} onChange={(e) => setDuration(e.target.value)}
          />
          <button className="mt-auto w-full py-3 bg-green-600 text-black font-black rounded-lg hover:bg-green-400 transition-colors">LOG EXERTION</button>
        </form>

      </div>

      {/* STATUS */}
      {status && <div className="w-full max-w-4xl p-4 mb-10 bg-gray-900 border border-green-500 rounded-lg text-center font-bold text-sm tracking-widest">{status}</div>}

      {/* HISTORY FEED */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 pb-20">
        
        <div className="bg-gray-950 border border-green-900 p-6 rounded-2xl">
          <h3 className="text-sm uppercase text-gray-500 mb-4 border-b border-green-900 pb-2">Recent Nutrition</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {mealHistory.map((m, i) => (
              <div key={i} className="group flex justify-between items-center p-3 bg-black border border-gray-900 rounded-lg hover:border-red-900 transition-all">
                <span className="text-xs truncate w-32">{m.description}</span>
                <div className="flex items-center gap-3">
                  <span className="text-green-500 text-xs font-bold">{m.calories} kcal</span>
                  <button 
                    onClick={() => deleteMeal(m.id)} 
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-300 text-xs font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-950 border border-green-900 p-6 rounded-2xl">
          <h3 className="text-sm uppercase text-gray-500 mb-4 border-b border-green-900 pb-2">Recent Physicals</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {workoutHistory.map((w, i) => (
              <div key={i} className="group flex justify-between items-center p-3 bg-black border border-gray-900 rounded-lg hover:border-red-900 transition-all">
                <span className="text-xs">{w.type}</span>
                <div className="flex items-center gap-3">
                  <span className="text-green-500 text-xs font-bold">{w.duration_minutes}m</span>
                  <button 
                    onClick={() => deleteWorkout(w.id)} 
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-300 text-xs font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </main>
  );
}
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

  // 5. Manual & API Form State
  const [manualDesc, setManualDesc] = useState("");
  const [manualCals, setManualCals] = useState("");
  const [manualPro, setManualPro] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

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
        setStatus(`✅ Logged [${data.description}]: ${data.calories} kcal`);
        setAiMealDesc(""); 
        setImageFile(null); 
        
        const fileInput = document.getElementById("image-upload");
        if (fileInput) fileInput.value = "";

        refreshDailyStats(); 
      } else {
        const errorData = await response.json();
        setStatus(`❌ ${errorData.detail || "AI analysis failed."}`);
      }
    } catch (error) {
      setStatus("❌ Connection to backend failed.");
    }
  };

  // --- USDA API SEARCH ---
  const handleSearchUSDA = async (e) => {
    e.preventDefault();
    if (!manualDesc) return setStatus("❌ Please type a food to search.");
    
    setStatus("🔍 Searching USDA Database...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/search-food/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: manualDesc }),
      });

      if (response.ok) {
        const data = await response.json();
        setManualDesc(data.description);
        setManualCals(data.calories);
        setManualPro(data.protein_g);
        setManualCarbs(data.carbs_g);
        setManualFat(data.fat_g);
        setStatus(`✅ Found USDA Data for: ${data.description}`);
      } else {
        setStatus("❌ Food not found in database.");
      }
    } catch (error) {
      setStatus("❌ Connection to database failed.");
    }
  };

  // --- MANUAL OVERRIDE LOGGING ---
  const handleManualLog = async (e) => {
    e.preventDefault();
    setStatus("Saving manual entry...");
    
    try {
      const response = await fetch("http://127.0.0.1:8000/meals/", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: 1, 
          description: manualDesc || "Custom Entry",
          calories: parseInt(manualCals) || 0,
          protein_g: parseFloat(manualPro) || 0,
          carbs_g: parseFloat(manualCarbs) || 0,
          fat_g: parseFloat(manualFat) || 0
        }),
      });

      if (response.ok) {
        setStatus("✅ Manual nutrition recorded!");
        setManualDesc(""); setManualCals(""); setManualPro(""); setManualCarbs(""); setManualFat("");
        refreshDailyStats();
      }
    } catch (error) {
      setStatus("❌ Failed to save manual entry.");
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

  // --- COLOR HELPERS FOR GAUGES ---
  const getGaugeColor = (key) => {
    switch(key) {
      case 'calories': return 'bg-orange-400 shadow-orange-200';
      case 'protein': return 'bg-rose-400 shadow-rose-200';
      case 'carbs': return 'bg-blue-400 shadow-blue-200';
      case 'fat': return 'bg-amber-400 shadow-amber-200';
      default: return 'bg-violet-400';
    }
  };

  // --- UI RENDER LOGIC ---
  if (authStatus === "loading") {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-violet-500 font-bold text-xl animate-pulse">Waking up your Bio-Twin...</main>;
  }

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-24 text-slate-800">
        <div className="z-10 max-w-lg w-full bg-white p-12 rounded-[2.5rem] text-center shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100">
          <div className="text-6xl mb-6">🧬</div>
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-500">
            Bio-Twin AI
          </h1>
          <p className="text-slate-500 mb-10 text-lg">Your smart, visual health architecture.</p>
          <button 
            onClick={() => signIn("google")} 
            className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="bg-white rounded-full p-1">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center py-12 bg-slate-50 text-slate-800 px-4 md:px-8 font-sans">
      
      {/* HEADER */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-10 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-fuchsia-500 tracking-tight flex items-center gap-3">
          🧬 Bio-Twin AI
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-slate-400 font-medium">Welcome back,</p>
            <p className="font-bold text-slate-700">{session.user.name}</p>
          </div>
          {session.user.image && (
            <img 
              src={session.user.image} 
              alt="Profile" 
              className="w-12 h-12 rounded-full border-2 border-violet-100 shadow-sm"
            />
          )}
          <button 
            onClick={() => signOut()} 
            className="p-2 ml-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 hover:text-slate-700 transition-colors"
            title="Log out"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      </div>

      {/* DASHBOARD GAUGES */}
      <div className="w-full max-w-6xl grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {Object.keys(goals).map((key) => {
          const current = dailyTotals[key];
          const goal = goals[key];
          const pct = Math.min((current / goal) * 100, 100);
          return (
            <div key={key} className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow">
              <div className="flex justify-between items-end mb-3">
                <span className="text-xs uppercase text-slate-400 font-bold tracking-wider">{key}</span>
                <span className="text-sm font-bold text-slate-700">{Math.round(current)}<span className="text-slate-400 text-xs font-normal">/{goal}</span></span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full shadow-sm transition-all duration-1000 ease-out ${getGaugeColor(key)}`}
                  style={{ width: `${pct}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* INPUT TOOLS - NOW 3 COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-6xl mb-10">
        
        {/* 1. AI FOOD LENS */}
        <form onSubmit={handleAILogMeal} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-violet-100 text-violet-600 rounded-xl text-xl">🧠</div>
            <h2 className="text-xl font-bold text-slate-800">AI Food Lens</h2>
          </div>
          
          <textarea 
            placeholder="What did you eat? (Or upload an image)"
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 mb-4 h-28 resize-none focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
            value={aiMealDesc} onChange={(e) => setAiMealDesc(e.target.value)}
          />
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Attach Photo</label>
            <input 
              id="image-upload"
              type="file" 
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-violet-50 file:text-violet-600 hover:file:bg-violet-100 cursor-pointer transition-colors"
            />
          </div>

          <button className="mt-auto w-full py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-violet-200 hover:-translate-y-0.5 transition-all">
            Process Intake
          </button>
        </form>

        {/* 2. USDA TRUTH ENGINE (MANUAL ENTRY) */}
        <form onSubmit={handleManualLog} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl text-xl">⚖️</div>
            <h2 className="text-xl font-bold text-slate-800">Truth Engine</h2>
          </div>
          
          <div className="flex gap-2 mb-6">
            <input 
              type="text" placeholder="Search USDA (e.g. Apple)" 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              value={manualDesc} onChange={(e) => setManualDesc(e.target.value)}
            />
            <button 
              type="button" onClick={handleSearchUSDA}
              className="px-5 bg-blue-50 text-blue-600 font-bold rounded-2xl hover:bg-blue-100 transition-colors"
            >
              Search
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <input type="number" placeholder="Calories" value={manualCals} onChange={(e) => setManualCals(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-400 transition-all placeholder:text-slate-400" />
            <input type="number" placeholder="Protein (g)" value={manualPro} onChange={(e) => setManualPro(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-400 transition-all placeholder:text-slate-400" />
            <input type="number" placeholder="Carbs (g)" value={manualCarbs} onChange={(e) => setManualCarbs(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-400 transition-all placeholder:text-slate-400" />
            <input type="number" placeholder="Fat (g)" value={manualFat} onChange={(e) => setManualFat(e.target.value)} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 outline-none focus:ring-2 focus:ring-blue-400 transition-all placeholder:text-slate-400" />
          </div>

          <button type="submit" className="mt-auto w-full py-4 border-2 border-blue-100 text-blue-600 font-bold rounded-2xl hover:bg-blue-50 hover:border-blue-200 transition-all">
            Log Exact Macros
          </button>
        </form>

        {/* 3. ACTIVITY LOG */}
        <form onSubmit={handleLogWorkout} className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm flex flex-col hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-orange-100 text-orange-500 rounded-xl text-xl">⚡</div>
            <h2 className="text-xl font-bold text-slate-800">Activity Log</h2>
          </div>
          
          <div className="flex flex-col gap-4 mb-6">
            <input 
              type="text" required placeholder="Activity (e.g. Pilates)" 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              value={workoutType} onChange={(e) => setWorkoutType(e.target.value)}
            />
            <input 
              type="number" required placeholder="Duration (Minutes)" 
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
              value={duration} onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <button className="mt-auto w-full py-4 bg-gradient-to-r from-orange-400 to-rose-400 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-orange-200 hover:-translate-y-0.5 transition-all">
            Log Exertion
          </button>
        </form>

      </div>

      {/* STATUS NOTIFICATION */}
      {status && (
        <div className="w-full max-w-6xl p-4 mb-10 bg-white border-l-4 border-violet-500 shadow-sm rounded-r-2xl text-slate-700 font-medium flex items-center animate-pulse">
          {status}
        </div>
      )}

      {/* HISTORY FEED */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 pb-20">
        
        <div className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800">Recent Nutrition</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{mealHistory.length} Entries</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
            {mealHistory.length === 0 ? <p className="text-slate-400 text-sm italic">No meals logged yet today.</p> : mealHistory.map((m, i) => (
              <div key={i} className="group flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-violet-200 hover:shadow-sm transition-all">
                <span className="text-sm font-medium text-slate-700 truncate w-48">{m.description}</span>
                <div className="flex items-center gap-4">
                  <span className="text-violet-600 text-sm font-bold bg-violet-100 px-3 py-1 rounded-lg">{m.calories} kcal</span>
                  <button 
                    onClick={() => deleteMeal(m.id)} 
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-8 rounded-[2rem] shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800">Recent Physicals</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{workoutHistory.length} Entries</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
            {workoutHistory.length === 0 ? <p className="text-slate-400 text-sm italic">No activity logged yet today.</p> : workoutHistory.map((w, i) => (
              <div key={i} className="group flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-orange-200 hover:shadow-sm transition-all">
                <span className="text-sm font-medium text-slate-700">{w.type}</span>
                <div className="flex items-center gap-4">
                  <span className="text-orange-500 text-sm font-bold bg-orange-100 px-3 py-1 rounded-lg">{w.duration_minutes} min</span>
                  <button 
                    onClick={() => deleteWorkout(w.id)} 
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Global Style for Custom Scrollbar to keep it clean */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
      `}</style>
    </main>
  );
}
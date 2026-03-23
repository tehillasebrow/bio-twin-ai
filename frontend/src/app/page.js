"use client";
import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  const { data: session, status: authStatus } = useSession();
  const [status, setStatus] = useState("");
  const [mealHistory, setMealHistory] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [dailyTotals, setDailyTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  
  // Form States
  const [aiMealDesc, setAiMealDesc] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [manual, setManual] = useState({ desc: "", cals: "", pro: "", carbs: "", fat: "" });
  const [workout, setWorkout] = useState({ type: "", duration: "" });

  const refreshData = async () => {
    const today = new Date().toISOString().split('T')[0];
    const [mRes, wRes] = await Promise.all([
      fetch("http://127.0.0.1:8000/meals/"),
      fetch("http://127.0.0.1:8000/workouts/")
    ]);
    
    if (mRes.ok) {
      const meals = (await mRes.json()).filter(m => m.date_logged === today);
      setMealHistory(meals.reverse());
      setDailyTotals(meals.reduce((acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein_g,
        carbs: acc.carbs + m.carbs_g,
        fat: acc.fat + m.fat_g,
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 }));
    }
    if (wRes.ok) setWorkoutHistory((await wRes.json()).filter(w => w.date_logged === today).reverse());
  };

  useEffect(() => { if (session) refreshData(); }, [session]);

  // AI Logic
  const handleAILog = async (e) => {
    e.preventDefault();
    setStatus("🧠 AI analyzing...");
    let base64 = null;
    if (imageFile) {
      const reader = new FileReader();
      base64 = await new Promise(r => {
        reader.onload = () => r(reader.result.split(",")[1]);
        reader.readAsDataURL(imageFile);
      });
    }
    const res = await fetch("http://127.0.0.1:8000/ai/log-meal/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 1, description: aiMealDesc, image_base64: base64 }),
    });
    if (res.ok) { setStatus("✅ AI Logged!"); refreshData(); }
  };

  // Truth Engine Search
  const handleUSDASearch = async () => {
    const res = await fetch("http://127.0.0.1:8000/api/search-food/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: manual.desc }),
    });
    if (res.ok) {
      const data = await res.json();
      setManual({ ...manual, desc: data.name, cals: data.calories, pro: data.protein, carbs: data.carbs, fat: data.fat });
    }
  };

  // Manual & Workout Submissions
  const logManual = async (e) => {
    e.preventDefault();
    const res = await fetch("http://127.0.0.1:8000/meals/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 1, description: manual.desc, calories: manual.cals, protein_g: manual.pro, carbs_g: manual.carbs, fat_g: manual.fat }),
    });
    if (res.ok) { setManual({ desc: "", cals: "", pro: "", carbs: "", fat: "" }); refreshData(); }
  };

  const logWorkout = async (e) => {
    e.preventDefault();
    const res = await fetch("http://127.0.0.1:8000/workouts/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: 1, type: workout.type, duration_minutes: workout.duration, calories_burned: workout.duration * 10 }),
    });
    if (res.ok) { setWorkout({ type: "", duration: "" }); refreshData(); }
  };

  if (!session) return <main className="p-24 text-center"><button onClick={() => signIn("google")} className="bg-black text-white px-8 py-4 rounded-2xl">Continue with Google</button></main>;

  return (
    <main className="p-8 max-w-7xl mx-auto bg-slate-50 min-h-screen text-slate-800">
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm">
        <h1 className="text-3xl font-black text-violet-600">🧬 Bio-Twin AI</h1>
        <button onClick={() => signOut()} className="text-slate-400">Sign Out</button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        {['calories', 'protein', 'carbs', 'fat'].map(k => (
          <div key={k} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold uppercase text-slate-400">{k}</span>
            <p className="text-2xl font-black">{Math.round(dailyTotals[k])}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {/* 1. AI LENS */}
        <form onSubmit={handleAILog} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🧠 AI Lens</h2>
          <textarea className="w-full p-4 bg-slate-50 rounded-2xl mb-4 h-24" placeholder="What's for dinner?" value={aiMealDesc} onChange={e => setAiMealDesc(e.target.value)} />
          <input type="file" onChange={e => setImageFile(e.target.files[0])} className="mb-4 text-xs" />
          <button className="w-full py-4 bg-violet-600 text-white font-bold rounded-2xl">Analyze Intake</button>
        </form>

        {/* 2. TRUTH ENGINE (Manual) */}
        <form onSubmit={logManual} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">⚖️ Truth Engine</h2>
          <div className="flex gap-2 mb-4">
            <input className="flex-1 p-3 bg-slate-50 rounded-xl" placeholder="Search USDA..." value={manual.desc} onChange={e => setManual({...manual, desc: e.target.value})} />
            <button type="button" onClick={handleUSDASearch} className="px-4 bg-blue-100 text-blue-600 rounded-xl font-bold">Search</button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <input type="number" placeholder="Cals" className="p-3 bg-slate-50 rounded-xl" value={manual.cals} onChange={e => setManual({...manual, cals: e.target.value})} />
            <input type="number" placeholder="Pro" className="p-3 bg-slate-50 rounded-xl" value={manual.pro} onChange={e => setManual({...manual, pro: e.target.value})} />
          </div>
          <button className="w-full py-4 border-2 border-blue-600 text-blue-600 font-bold rounded-2xl">Log Exact Macros</button>
        </form>

        {/* 3. ACTIVITY LOG */}
        <form onSubmit={logWorkout} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">⚡ Activity</h2>
          <input className="w-full p-4 bg-slate-50 rounded-2xl mb-4" placeholder="Workout type..." value={workout.type} onChange={e => setWorkout({...workout, type: e.target.value})} />
          <input className="w-full p-4 bg-slate-50 rounded-2xl mb-4" placeholder="Minutes" value={workout.duration} onChange={e => setWorkout({...workout, duration: e.target.value})} />
          <button className="w-full py-4 bg-orange-500 text-white font-bold rounded-2xl">Log Exertion</button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] shadow-sm">
          <h3 className="font-bold mb-6 border-b pb-4">Recent Nutrition</h3>
          <div className="space-y-4">
            {mealHistory.map((m, i) => (
              <div key={i} className="flex gap-4 items-center p-4 bg-slate-50 rounded-2xl">
                {m.image_data && <img src={`data:image/jpeg;base64,${m.image_data}`} className="w-16 h-16 rounded-xl object-cover" />}
                <div className="flex-1">
                  <p className="font-bold">{m.description}</p>
                  <p className="text-xs text-slate-400">{m.calories} kcal</p>
                  {m.items_json && <div className="text-[10px] text-slate-500 mt-1">{JSON.parse(m.items_json).map(it => it.name).join(", ")}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] shadow-sm">
          <h3 className="font-bold mb-6 border-b pb-4">Recent Physicals</h3>
          {workoutHistory.map((w, i) => (
            <div key={i} className="p-4 bg-slate-50 rounded-2xl mb-2 flex justify-between">
              <span>{w.type}</span>
              <span className="font-bold text-orange-500">{w.duration_minutes} min</span>
            </div>
          ))}
        </div>
      </div>
      {status && <div className="fixed bottom-8 right-8 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl animate-bounce">{status}</div>}
    </main>
  );
}
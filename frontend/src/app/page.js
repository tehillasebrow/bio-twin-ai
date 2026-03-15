"use client";
import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

export default function Home() {
  // 1. Authentication State
  const { data: session, status: authStatus } = useSession();
  const [status, setStatus] = useState("");
  
  // 2. Form State
  const [aiMealDesc, setAiMealDesc] = useState("");
  const [workoutType, setWorkoutType] = useState("");
  const [duration, setDuration] = useState("");

  // 3. AI Food Logging Function (Using Gemini Backend)
  const handleAILogMeal = async (e) => {
    e.preventDefault();
    setStatus("🧠 AI is analyzing your food...");
    
    const payload = {
      user_id: 1, // We will link this to your actual logged-in user database ID later
      description: aiMealDesc
    };

    try {
      const response = await fetch("http://127.0.0.1:8000/ai/log-meal/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(`✅ AI Logged: ${data.calories} kcal | Protein: ${data.protein_g}g | Carbs: ${data.carbs_g}g | Fat: ${data.fat_g}g`);
        setAiMealDesc(""); 
      } else {
        setStatus("❌ AI failed to analyze meal.");
      }
    } catch (error) {
      setStatus("❌ Error connecting to backend.");
    }
  };

  // 4. Manual Workout Logging Function
  const handleLogWorkout = async (e) => {
    e.preventDefault();
    setStatus("Logging workout...");
    
    const workoutData = {
      user_id: 1, 
      type: workoutType,
      duration_minutes: parseInt(duration),
      calories_burned: parseInt(duration) * 10 // Rough estimate for now
    };

    try {
      const response = await fetch("http://localhost:8000/workouts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workoutData),
      });

      if (response.ok) {
        setStatus("✅ Workout logged successfully!");
        setWorkoutType(""); 
        setDuration(""); 
      } else {
        setStatus("❌ Failed to log workout.");
      }
    } catch (error) {
      setStatus("❌ Error connecting to backend.");
    }
  };

  // --- RENDER STATES ---

  // State A: Checking login status
  if (authStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-green-400 font-mono text-xl animate-pulse">
        Initializing Bio-Twin Core...
      </main>
    );
  }

  // State B: User is NOT logged in (Show Login Screen)
  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black p-24 font-mono text-green-400">
        <div className="z-10 max-w-5xl w-full items-center justify-center flex flex-col gap-8 border border-green-500 p-12 rounded-xl bg-gray-900 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
          <h1 className="text-4xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 text-center">
            BIO-TWIN AI
          </h1>
          <p className="text-gray-400 text-center max-w-md">
            Your personal AI health and fitness architecture. Please authenticate to access your data dashboard.
          </p>
          <button 
            onClick={() => signIn("google")}
            className="mt-4 px-6 py-3 bg-white text-black font-bold rounded-md hover:bg-gray-200 transition-all flex items-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  // State C: User IS logged in (Show Dashboard)
  return (
    <main className="flex min-h-screen flex-col items-center py-12 bg-black font-mono text-green-400">
      
      {/* Top Navigation Bar */}
      <div className="w-full max-w-4xl px-4 flex justify-between items-center mb-12 border-b border-green-800 pb-4">
        <h1 className="text-3xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600">
          BIO-TWIN AI
        </h1>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm text-gray-400">Authenticated as:</p>
            <p className="font-bold text-white">{session.user.name}</p>
          </div>
          {session.user.image && (
            <img 
              src={session.user.image} 
              alt="Profile" 
              className="w-10 h-10 rounded-full border-2 border-green-500"
            />
          )}
          <button 
            onClick={() => signOut()}
            className="px-3 py-1.5 ml-2 border border-green-700 text-green-500 rounded hover:bg-green-900 transition-colors text-sm"
          >
            Disconnect
          </button>
        </div>
      </div>
      
      {/* The Forms */}
      <div className="flex gap-8 w-full max-w-4xl px-4 flex-col md:flex-row">
        
        {/* AI MEAL FORM */}
        <form onSubmit={handleAILogMeal} className="flex-1 border border-green-500 p-6 rounded-xl bg-gray-900 shadow-[0_0_10px_rgba(34,197,94,0.1)] flex flex-col">
          <h2 className="text-2xl mb-2 border-b border-green-800 pb-2 flex items-center gap-2">
            🧠 AI Food Lens
          </h2>
          <p className="text-sm text-gray-400 mb-4">Type what you ate. The AI will calculate the macros.</p>
          <div className="flex flex-col gap-3 flex-grow">
            <textarea 
              required 
              placeholder="e.g. 3 scrambled eggs with a slice of sourdough toast and black coffee..." 
              className="p-3 bg-black border border-green-800 rounded text-white focus:outline-none focus:border-green-400 flex-grow resize-none"
              value={aiMealDesc} 
              onChange={(e) => setAiMealDesc(e.target.value)}
            />
            <button type="submit" className="mt-2 px-4 py-3 bg-green-600 text-black font-bold rounded hover:bg-green-500 transition-colors">
              Analyze & Save
            </button>
          </div>
        </form>

        {/* WORKOUT FORM */}
        <form onSubmit={handleLogWorkout} className="flex-1 border border-green-500 p-6 rounded-xl bg-gray-900 shadow-[0_0_10px_rgba(34,197,94,0.1)] flex flex-col">
          <h2 className="text-2xl mb-2 border-b border-green-800 pb-2 flex items-center gap-2">
            ⚡ Activity Log
          </h2>
          <p className="text-sm text-gray-400 mb-4">Manually record your physical activity.</p>
          <div className="flex flex-col gap-3 flex-grow justify-start">
            <input 
              type="text" required placeholder="Workout Type (e.g. Running)" 
              className="p-3 bg-black border border-green-800 rounded text-white focus:outline-none focus:border-green-400"
              value={workoutType} onChange={(e) => setWorkoutType(e.target.value)}
            />
            <input 
              type="number" required placeholder="Duration (minutes)" 
              className="p-3 bg-black border border-green-800 rounded text-white focus:outline-none focus:border-green-400"
              value={duration} onChange={(e) => setDuration(e.target.value)}
            />
            <button type="submit" className="mt-auto px-4 py-3 bg-green-600 text-black font-bold rounded hover:bg-green-500 transition-colors">
              Save Workout
            </button>
          </div>
        </form>

      </div>

      {/* Status Message Display */}
      {status && (
        <div className="mt-8 w-full max-w-4xl px-4">
          <p className="text-lg animate-pulse bg-gray-900 px-6 py-4 rounded-lg border border-green-800 text-center">
            {status}
          </p>
        </div>
      )}

    </main>
  );
}
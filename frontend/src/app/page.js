"use client";
import { useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("");
  
  // Meal Form State
  const [mealDesc, setMealDesc] = useState("");
  const [calories, setCalories] = useState("");

  // Workout Form State
  const [workoutType, setWorkoutType] = useState("");
  const [duration, setDuration] = useState("");

  const handleLogMeal = async (e) => {
    e.preventDefault();
    setStatus("Logging meal...");
    
    const mealData = {
      user_id: 1, 
      description: mealDesc,
      calories: parseInt(calories),
      protein_g: 0.0, // We will let the AI calculate these next week!
      carbs_g: 0.0,
      fat_g: 0.0
    };

    try {
      const response = await fetch("http://localhost:8000/meals/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mealData),
      });

      if (response.ok) {
        setStatus("✅ Meal logged successfully!");
        setMealDesc(""); setCalories(""); // clear form
      } else setStatus("❌ Failed to log meal.");
    } catch (error) {
      setStatus("❌ Error connecting to backend.");
    }
  };

  const handleLogWorkout = async (e) => {
    e.preventDefault();
    setStatus("Logging workout...");
    
    const workoutData = {
      user_id: 1, 
      type: workoutType,
      duration_minutes: parseInt(duration),
      calories_burned: parseInt(duration) * 10 // rough estimate for now
    };

    try {
      const response = await fetch("http://localhost:8000/workouts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workoutData),
      });

      if (response.ok) {
        setStatus("✅ Workout logged successfully!");
        setWorkoutType(""); setDuration(""); // clear form
      } else setStatus("❌ Failed to log workout.");
    } catch (error) {
      setStatus("❌ Error connecting to backend.");
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center py-12 bg-black font-mono text-green-400">
      <h1 className="text-4xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-green-600 mb-8">
        BIO-TWIN AI
      </h1>
      
      <div className="flex gap-8 w-full max-w-4xl px-4 flex-col md:flex-row">
        
        {/* MEAL FORM */}
        <form onSubmit={handleLogMeal} className="flex-1 border border-green-500 p-6 rounded-xl bg-gray-900">
          <h2 className="text-2xl mb-4 border-b border-green-800 pb-2">Log a Meal</h2>
          <div className="flex flex-col gap-3">
            <input 
              type="text" required placeholder="What did you eat?" 
              className="p-2 bg-black border border-green-800 rounded text-white"
              value={mealDesc} onChange={(e) => setMealDesc(e.target.value)}
            />
            <input 
              type="number" required placeholder="Estimated Calories" 
              className="p-2 bg-black border border-green-800 rounded text-white"
              value={calories} onChange={(e) => setCalories(e.target.value)}
            />
            <button type="submit" className="mt-2 px-4 py-2 bg-green-600 text-black font-bold rounded hover:bg-green-500">
              Save Meal
            </button>
          </div>
        </form>

        {/* WORKOUT FORM */}
        <form onSubmit={handleLogWorkout} className="flex-1 border border-green-500 p-6 rounded-xl bg-gray-900">
          <h2 className="text-2xl mb-4 border-b border-green-800 pb-2">Log a Workout</h2>
          <div className="flex flex-col gap-3">
            <input 
              type="text" required placeholder="Workout Type (e.g. Running)" 
              className="p-2 bg-black border border-green-800 rounded text-white"
              value={workoutType} onChange={(e) => setWorkoutType(e.target.value)}
            />
            <input 
              type="number" required placeholder="Duration (minutes)" 
              className="p-2 bg-black border border-green-800 rounded text-white"
              value={duration} onChange={(e) => setDuration(e.target.value)}
            />
            <button type="submit" className="mt-2 px-4 py-2 bg-green-600 text-black font-bold rounded hover:bg-green-500">
              Save Workout
            </button>
          </div>
        </form>

      </div>

      {status && <p className="mt-8 text-xl animate-pulse">{status}</p>}
    </main>
  );
}
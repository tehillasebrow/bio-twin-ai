"use client";
import { useState, useEffect } from "react";
import { API_URL } from "../lib/api";

export default function ProfileSetup({ userId, email, onSaved }) {
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [goal, setGoal] = useState("2500");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${API_URL}/api/user/${userId}`);
      if (r.ok) {
        const u = await r.json();
        setLoaded(u);
        setWeight(u.current_weight_lbs ?? "");
        setHeight(u.height_in ?? "");
        setGoal(u.daily_calorie_goal ?? 2500);
      }
    })();
  }, [userId]);

  const save = async (e) => {
    e.preventDefault();
    await fetch(`${API_URL}/api/user/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        email,
        current_weight_lbs: weight ? +weight : null,
        height_in: height ? +height : null,
        daily_calorie_goal: goal ? +goal : 2500,
      }),
    });
    if (weight) {
      await fetch(`${API_URL}/api/weight/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, weight_lbs: +weight }),
      });
    }
    setOpen(false);
    onSaved && (await onSaved());
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded-full bg-slate-200 hover:bg-slate-300 font-semibold"
      >
        {loaded?.current_weight_lbs
          ? `${loaded.current_weight_lbs} lb · Edit`
          : "Set up profile"}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={save}
            className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full"
          >
            <h3 className="text-xl font-bold mb-4">Profile</h3>
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Current weight (lb)
            </label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl mb-4"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Height (in)
            </label>
            <input
              type="number"
              step="0.1"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl mb-4"
            />
            <label className="block text-xs font-bold text-slate-500 mb-1">
              Daily calorie goal
            </label>
            <input
              type="number"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl mb-6"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 font-bold"
              >
                Cancel
              </button>
              <button className="flex-1 py-3 rounded-xl bg-violet-600 text-white font-bold">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

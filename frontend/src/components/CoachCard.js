"use client";
import { useEffect, useState } from "react";

export default function CoachCard({ userId, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`http://127.0.0.1:8000/api/coach/${userId}`);
      if (r.ok) setData(await r.json());
    } catch (_) {
      setData({ insight: "Coach unreachable." });
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userId, refreshKey]);

  return (
    <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-6 sm:p-8 rounded-3xl shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          AI Coach
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
        >
          {loading ? "Thinking..." : "Refresh"}
        </button>
      </div>
      <p className="text-sm sm:text-base leading-relaxed opacity-95">
        {data?.insight || "Generating today's insight..."}
      </p>
      {data?.action && (
        <div className="mt-4 bg-black/20 p-3 sm:p-4 rounded-2xl">
          <span className="text-[10px] uppercase font-bold opacity-70 tracking-wider">
            Action for tomorrow
          </span>
          <p className="text-sm sm:text-base font-semibold mt-1">{data.action}</p>
        </div>
      )}
    </div>
  );
}

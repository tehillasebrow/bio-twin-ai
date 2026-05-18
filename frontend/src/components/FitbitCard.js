"use client";
import { useState } from "react";

export default function FitbitCard({ metrics, userId, onSync }) {
  const [syncing, setSyncing] = useState(false);
  const today =
    metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;

  const sync = async () => {
    setSyncing(true);
    try {
      await fetch(`http://127.0.0.1:8000/api/sync-fitbit/${userId}`, {
        method: "POST",
      });
      onSync && (await onSync());
    } catch (_) {}
    setSyncing(false);
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">Wearable</h2>
        <div className="flex gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="text-xs px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 font-semibold"
          >
            {syncing ? "Syncing..." : "Sync today"}
          </button>
          <a
            href="http://localhost:8000/auth/fitbit/login"
            className="text-xs px-3 py-1 rounded-full bg-teal-500 text-white font-semibold"
          >
            Connect
          </a>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric label="Steps" value={today?.steps ?? "—"} />
        <Metric
          label="Active"
          value={today ? `${today.active_minutes}m` : "—"}
        />
        <Metric
          label="Sleep"
          value={
            today && today.sleep_minutes
              ? `${Math.round((today.sleep_minutes / 60) * 10) / 10}h`
              : "—"
          }
        />
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">
        {label}
      </p>
      <p className="text-lg font-black mt-1">{value}</p>
    </div>
  );
}

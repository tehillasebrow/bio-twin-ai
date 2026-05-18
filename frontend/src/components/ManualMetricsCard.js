"use client";
import { useState, useEffect } from "react";

export default function ManualMetricsCard({ userId, todayMetric, onSaved }) {
  const [steps, setSteps] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [activeMin, setActiveMin] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (todayMetric) {
      setSteps(todayMetric.steps || "");
      setSleepHours(
        todayMetric.sleep_minutes
          ? Math.round((todayMetric.sleep_minutes / 60) * 10) / 10
          : ""
      );
      setActiveMin(todayMetric.active_minutes || "");
      setRestingHr(todayMetric.resting_heart_rate || "");
    }
  }, [todayMetric]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      user_id: userId,
      steps: steps === "" ? null : +steps,
      sleep_minutes: sleepHours === "" ? null : Math.round(+sleepHours * 60),
      active_minutes: activeMin === "" ? null : +activeMin,
      resting_heart_rate: restingHr === "" ? null : +restingHr,
    };
    try {
      await fetch("http://127.0.0.1:8000/api/metrics/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved && (await onSaved());
    } catch (_) {}
    setSaving(false);
  };

  return (
    <form
      onSubmit={save}
      className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100"
    >
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        📝 Manual Metrics
      </h2>
      <p className="text-xs text-slate-400 mb-4">
        Today's totals — overwrites whatever's there.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Field label="Steps" value={steps} onChange={setSteps} placeholder="8000" />
        <Field
          label="Sleep (hrs)"
          value={sleepHours}
          onChange={setSleepHours}
          step="0.1"
          placeholder="7.5"
        />
        <Field
          label="Active min"
          value={activeMin}
          onChange={setActiveMin}
          placeholder="45"
        />
        <Field
          label="Resting HR"
          value={restingHr}
          onChange={setRestingHr}
          placeholder="62"
        />
      </div>
      <button
        disabled={saving}
        className={`w-full py-3 font-bold rounded-2xl transition ${
          saved
            ? "bg-emerald-500 text-white"
            : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {saving ? "Saving…" : saved ? "✓ Saved" : "Save today's metrics"}
      </button>
    </form>
  );
}

function Field({ label, value, onChange, placeholder, step }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <input
        type="number"
        step={step || "1"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-2.5 bg-slate-50 rounded-xl text-sm mt-1"
      />
    </label>
  );
}

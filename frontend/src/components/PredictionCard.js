"use client";

export default function PredictionCard({ prediction }) {
  if (!prediction) {
    return (
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg">
        <h3 className="text-sm uppercase tracking-widest opacity-60">
          30-Day Twin
        </h3>
        <p className="text-sm mt-3 opacity-70">
          Set your current weight on the profile, then log meals to enable the
          projection.
        </p>
      </div>
    );
  }

  const delta = (
    (prediction.predicted_weight_lbs ?? 0) -
    (prediction.current_weight_lbs ?? 0)
  ).toFixed(1);
  const sign = +delta > 0 ? "+" : "";
  const trendColor =
    prediction.trend === "losing"
      ? "text-emerald-400"
      : prediction.trend === "gaining"
      ? "text-rose-400"
      : "text-slate-300";

  return (
    <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg">
      <h3 className="text-sm uppercase tracking-widest opacity-60">
        30-Day Twin
      </h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-4xl font-black">
          {prediction.predicted_weight_lbs} lb
        </span>
        <span className={`text-lg font-bold ${trendColor}`}>
          {sign}
          {delta}
        </span>
      </div>
      <p className="text-xs opacity-60 mt-2 capitalize">
        Trend: {prediction.trend}
        {prediction.avg_daily_delta_kcal !== undefined &&
          ` · Avg balance ${prediction.avg_daily_delta_kcal} kcal/day`}
      </p>
    </div>
  );
}

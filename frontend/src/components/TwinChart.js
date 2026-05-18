"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function TwinChart({ history, prediction }) {
  // history: [{ date, weight }]
  // prediction: { current_weight_lbs, predicted_weight_lbs, days_ahead, slope_lbs_per_day }
  if (!history || history.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-12">
        Log your weight to start the projection.
      </div>
    );
  }

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = sorted[sorted.length - 1].date;
  const lastWeight = sorted[sorted.length - 1].weight;

  const points = sorted.map((p) => ({
    date: p.date,
    historical: p.weight,
    predicted: null,
  }));

  if (prediction && prediction.slope_lbs_per_day !== undefined) {
    const baseDate = new Date(lastDate);
    const slope = prediction.slope_lbs_per_day || 0;
    const ahead = prediction.days_ahead || 30;
    points[points.length - 1].predicted = lastWeight;
    for (let i = 1; i <= ahead; i += Math.max(1, Math.floor(ahead / 8))) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      points.push({
        date: d.toISOString().split("T")[0],
        historical: null,
        predicted: +(lastWeight + slope * i).toFixed(2),
      });
    }
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
        <YAxis stroke="#94a3b8" fontSize={10} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 12,
            color: "#e2e8f0",
          }}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
        <ReferenceLine x={lastDate} stroke="#a78bfa" strokeDasharray="2 2" />
        <Line
          type="monotone"
          dataKey="historical"
          name="Actual weight"
          stroke="#22d3ee"
          strokeWidth={3}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="predicted"
          name="AI projection"
          stroke="#a78bfa"
          strokeWidth={3}
          strokeDasharray="6 4"
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

"use client";

export default function StreakBadge({ streak }) {
  return (
    <div className="bg-gradient-to-br from-orange-500 to-red-600 text-white p-5 rounded-3xl shadow-lg flex flex-col items-center justify-center">
      <span className="text-4xl sm:text-5xl">🔥</span>
      <span className="text-3xl sm:text-4xl font-black mt-1">{streak ?? 0}</span>
      <span className="text-[10px] uppercase tracking-widest mt-1 opacity-90">
        Day Streak
      </span>
    </div>
  );
}

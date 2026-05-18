"use client";
import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  "I slept 7 hours",
  "Did 8,500 steps today",
  "Weighed in at 162 lb",
  "Just ran for 30 minutes",
];

export default function ChatBox({ userId, onLogged }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hey! Tell me what you did today — sleep, steps, weight, workouts — and I'll log it. Or just chat.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = async (e, presetText) => {
    e?.preventDefault?.();
    const text = (presetText ?? input).trim();
    if (!text || sending) return;

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const r = await fetch("http://127.0.0.1:8000/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: text,
          history: next.slice(-8),
        }),
      });
      const data = await r.json();

      const reply = data.reply || "Got it.";
      const tag =
        data.logged?.type === "metric"
          ? " · 📊 logged metric"
          : data.logged?.type === "weight"
          ? " · ⚖️ weight logged"
          : data.logged?.type === "workout"
          ? " · 💪 workout logged"
          : "";

      setMessages((m) => [
        ...m,
        { role: "assistant", content: reply + tag, logged: !!data.logged },
      ]);

      if (data.logged && onLogged) await onLogged();
    } catch (_) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Couldn't reach the server. Try again?" },
      ]);
    }
    setSending(false);
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col h-[460px]">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold flex items-center gap-2">
          <span className="text-violet-600">💬</span> Chat with Bio-Twin
        </h2>
        <span className="text-[10px] text-slate-400">
          Try: "slept 7h" · "ran 30 min"
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-violet-600 text-white rounded-br-sm"
                  : m.logged
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-bl-sm"
                  : "bg-slate-100 text-slate-800 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 px-4 py-2.5 rounded-2xl text-sm text-slate-500">
              thinking…
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(null, s)}
              className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full text-slate-600"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
        <input
          className="flex-1 p-3 bg-slate-50 rounded-2xl text-sm"
          placeholder="Tell me anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          disabled={sending || !input.trim()}
          className="px-5 bg-violet-600 disabled:bg-slate-300 text-white font-bold rounded-2xl text-sm"
        >
          Send
        </button>
      </form>
    </div>
  );
}

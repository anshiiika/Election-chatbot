import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";
const SESSION_ID = "user_" + Math.random().toString(36).slice(2, 9);
const YEARS = ["2026", "2021", "2016", "2011"];
const STATES = ["All", "Assam", "Kerala", "Puducherry", "Tamil Nadu", "West Bengal"];

function randomYear() {
  return YEARS[Math.floor(Math.random() * YEARS.length)];
}

export default function App() {
  const [tab, setTab] = useState("chat");
  const tabs = [
    { id: "chat", label: "💬 Chat" },
    { id: "quiz", label: "🎯 Quiz" },
    { id: "stats", label: "📊 Stats" },
  ];
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <h1 className="text-2xl font-semibold text-gray-800 mb-1">Election Assistant</h1>
      <p className="text-sm text-gray-400 mb-6">2011 · 2016 · 2021 · 2026 · State Assembly Data · Powered by Claude</p>
      <div className="flex gap-2 mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all
              ${tab === t.id ? "bg-indigo-600 text-white shadow" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-400"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="w-full max-w-xl">
        {tab === "chat" && <ChatTab />}
        {tab === "quiz" && <QuizTab />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
  );
}


function ChatTab() {
  const [messages, setMessages] = useState([{
    role: "assistant",
    text: "Hi! Ask me anything about the assembly elections — who won, runner-ups, polling phases, sitting MLAs, party tallies across 2011–2026."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const suggestions = [
    "Who won Mekliganj, West Bengal in 2021?",
    "Who is the sitting MLA of Gossaigaon, Assam?",
    "Who was the runner-up in Palakkad, Kerala in 2021?",
    "Who won Gummidipoondi, Tamil Nadu in 2016?",
  ];

  async function send(q) {
    const question = (q || input).trim();
    if (!question || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: SESSION_ID, question }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Error connecting to server. Is the backend running?" }]);
    }
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col" style={{ height: "540px" }}>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
              ${m.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips — only at start */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-xs px-3 py-1 rounded-full border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-gray-100 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask anything about the election data..."
          className="flex-1 text-sm px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400" />
        <button onClick={() => send()} disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition">
          Send
        </button>
      </div>
    </div>
  );
}


const DIFF_COLORS = {
  easy: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  hard: "bg-red-50 text-red-700 border-red-200",
};

function QuizTab() {
  const [difficulty, setDifficulty] = useState("easy");
  const [state, setState] = useState("All");
  const [question, setQuestion] = useState(null);
  const [currentYear, setCurrentYear] = useState(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [hintShown, setHintShown] = useState(false);
  const [answered, setAnswered] = useState(false);

  async function fetchQuestion() {
    const year = randomYear();
    setCurrentYear(year);
    setLoading(true); setQuestion(null); setFeedback(null);
    setAnswer(""); setHintShown(false); setAnswered(false);
    try {
      const res = await fetch(`${API}/quiz/question`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, year, ...(state !== "All" && { state }) }),
      });
      setQuestion(await res.json());
    } catch { setFeedback({ correct: null, message: "Error fetching question." }); }
    setLoading(false);
  }

  async function submitAnswer() {
    if (!answer.trim() || answered) return;
    setAnswered(true); setLoading(true);
    try {
      const res = await fetch(`${API}/quiz/check`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correct_answer: question.answer, user_answer: answer.trim(), difficulty }),
      });
      const data = await res.json();
      setFeedback(data); setTotal(t => t + 1);
      if (data.correct) { setScore(s => s + Number(question.points || 1)); setCorrect(c => c + 1); setStreak(s => s + 1); }
      else { setStreak(0); }
    } catch { setFeedback({ correct: false, message: "Error checking answer." }); }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[["Score", score], ["Correct", correct], ["Total", total], ["Streak", streak]].map(([l, v]) => (
          <div key={l} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <div className="text-xs text-gray-400 mb-0.5">{l}</div>
            <div className="text-xl font-semibold text-gray-800">{v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400">Difficulty</span>
          {["easy", "medium", "hard"].map(d => (
            <button key={d} onClick={() => setDifficulty(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition
                ${difficulty === d ? DIFF_COLORS[d] : "text-gray-400 border-gray-200 hover:border-gray-400"}`}>
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400">State</span>
          {STATES.map(s => (
            <button key={s} onClick={() => setState(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition
                ${state === s ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "text-gray-400 border-gray-200 hover:border-gray-400"}`}>
              {s}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Years are shuffled randomly across 2011, 2016, 2021 &amp; 2026. Hard mode asks cross-year comparison questions.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 min-h-28">
        {loading && !question && <p className="text-sm text-gray-400 italic">Claude is generating a question...</p>}
        {!loading && !question && !feedback && <p className="text-sm text-gray-400">Press "New question" to start.</p>}
        {question && (
          <div>
            <div className="flex gap-2 mb-3 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${DIFF_COLORS[difficulty]}`}>{difficulty}</span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">{question.row?.state}</span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700">{question.row?.name_ac}</span>
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700">{currentYear}</span>
            </div>
            <p className="text-base text-gray-800 leading-relaxed">{question.question}</p>
          </div>
        )}
      </div>

      {question && !answered && (
        <div className="flex gap-2">
          <input value={answer} onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitAnswer()}
            placeholder="Your answer..." autoFocus
            className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-400" />
          <button onClick={submitAnswer} disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition">
            Submit
          </button>
        </div>
      )}

      {question && !answered && !hintShown && (
        <button onClick={() => setHintShown(true)} className="text-xs text-gray-400 hover:text-gray-600 underline">
          Show hint
        </button>
      )}
      {hintShown && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">Hint: {question?.hint}</p>}

      {feedback && feedback.correct !== null && (
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed border
          ${feedback.correct ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}>
          {feedback.message}
          {answered && question?.row && (
            <div className="mt-2 text-xs opacity-70">
              {question.row.name_ac}, {question.row.state} ({currentYear}) — {question.row.winner} ({question.row.winner_party}) defeated {question.row.runnerup} ({question.row.runnerup_party})
            </div>
          )}
        </div>
      )}

      <button onClick={fetchQuestion} disabled={loading}
        className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition">
        {loading ? "Loading..." : answered ? "Next question →" : "New question"}
      </button>
    </div>
  );
}


function StatsTab() {
  const [year, setYear] = useState("2026");
  const [state, setState] = useState("All");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchStats() {
    setLoading(true); setData(null);
    try {
      const url = state === "All" ? `${API}/stats/${year}` : `${API}/stats/${year}?state=${encodeURIComponent(state)}`;
      const res = await fetch(url);
      setData(await res.json());
    } catch { setData({ error: "Could not fetch stats." }); }
    setLoading(false);
  }

  useEffect(() => { fetchStats(); }, [year, state]);

  const tally = data?.seat_tally || {};
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;

  const partyColors = {
    BJP: "bg-orange-400", INC: "bg-blue-500", SP: "bg-red-400",
    BSP: "bg-blue-800", TMC: "bg-green-500", DMK: "bg-red-600",
    AIADMK: "bg-yellow-500", JDU: "bg-yellow-400", RJD: "bg-green-700",
    "AAP": "bg-sky-500", NCP: "bg-blue-600", SHS: "bg-orange-500",
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400">Election year</span>
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition
                ${year === y ? "bg-indigo-600 text-white border-indigo-600" : "text-gray-500 border-gray-200 hover:border-gray-400"}`}>
              {y}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-xs text-gray-400">State</span>
          {STATES.map(s => (
            <button key={s} onClick={() => setState(s)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition
                ${state === s ? "bg-indigo-600 text-white border-indigo-600" : "text-gray-500 border-gray-200 hover:border-gray-400"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Seats won — {year} · {state}</h2>
        {loading && <p className="text-sm text-gray-400 italic">Loading...</p>}
        {data?.error && <p className="text-sm text-red-500">{data.error}</p>}
        {!loading && sorted.length > 0 && (
          <div className="space-y-2.5">
            {sorted.slice(0, 20).map(([party, seats]) => (
              <div key={party} className="flex items-center gap-3">
                <div className="w-20 text-xs text-gray-600 text-right shrink-0 font-medium">{party}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${partyColors[party] || "bg-indigo-400"}`}
                    style={{ width: `${(seats / max) * 100}%` }} />
                </div>
                <div className="w-8 text-xs text-gray-500 shrink-0">{seats}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
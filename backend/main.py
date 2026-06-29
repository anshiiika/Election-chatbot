from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
from groq import Groq
import random
import os
import json
from typing import Optional

app = FastAPI(title="Election Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sheets = pd.read_excel("election_data.xlsx", sheet_name=None)
df = pd.concat(sheets.values(), ignore_index=True)
df.columns = df.columns.str.strip()          # remove accidental spaces
df = df.where(pd.notna(df), None)            # convert NaN → None (JSON safe)

YEARS  = ["2026", "2021", "2016", "2011"]
STATES = sorted(df["STATE_AC"].dropna().unique().tolist())

# GROQ CLIENT
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# IN-MEMORY SESSION HISTORY
sessions: dict[str, list[dict]] = {}
WINDOW = 3


def get_history(sid: str) -> list[dict]:
    return sessions.get(sid, [])

def save_turn(sid: str, question: str, answer: str):
    h = sessions.setdefault(sid, [])
    h.append({"role": "user",      "content": question})
    h.append({"role": "assistant", "content": answer})
    sessions[sid] = h[-(WINDOW * 2):]



def build_data_context(question: str) -> str:
    q = question.lower()

    # detect which year(s) the user is asking about
    asked_years = [yr for yr in YEARS if yr in q]
    if not asked_years:
        asked_years = YEARS   
    # decide which columns to include based on question
    base_cols = ["NAME_AC", "STATE_AC", "DISTRICT_AC", "NAME_PC", "SITTING_MLA_NAME_AC", "SITTING_MLA_PARTY_AC"]

    year_cols = []
    for yr in asked_years:
        year_cols += [
            f"WINNING_CAND_AC_{yr}",
            f"WINNER_PARTY_AC_{yr}",
            f"RUNNERSUP_CAND_AC_{yr}",
            f"RUNNERSUP_PARTY_AC_{yr}",
        ]
        # add poll/result dates only if question is about dates/phases
        if any(kw in q for kw in ["date", "when", "phase", "poll", "day", "result"]):
            year_cols += [
                f"POLL_DATE_AC_{yr}",
                f"POLL_PHASE_AC_{yr}",
                f"RESULTS_DATE_AC_{yr}",
            ]
        # add all candidates only if question asks about them
        if any(kw in q for kw in ["candidate", "candidates", "all", "who ran", "list"]):
            year_cols += [f"CANDIDATES_NAMES_AC_{yr}"]

    use_cols = [c for c in base_cols + year_cols if c in df.columns]

    search_cols = ["NAME_AC", "DISTRICT_AC", "NAME_PC"]
    state_col   = "STATE_AC"

    # Extract words from question (filter out)
    filler = {"who", "what", "which", "was", "the", "in", "of", "a", "an", "is",
              "are", "won", "how", "many", "did", "does", "from", "for", "has",
              "had", "have", "party", "runner", "up", "winner", "sitting", "mla",
              "phase", "polled", "date", "seat", "seats", "tally", "election"}
    q_words = [w.strip("?,.'\"!") for w in q.split() if w.strip("?,.'\"!") and w.strip("?,.'\"!") not in filler and len(w.strip("?,.'\"!")) > 1]

    def score_row(r):
        s = 0
        for col in search_cols:
            v = r.get(col)
            if v is None:
                continue
            v_lower = str(v).lower()
            # Exact constituency name match → highest priority
            if v_lower in q:
                s += 10
            # Individual word overlap with constituency name
            for w in q_words:
                if w in v_lower or v_lower in w:
                    s += 5
        # State match is low-priority context (avoid flooding)
        sv = r.get(state_col)
        if sv and str(sv).lower() in q:
            s += 1
        return s

    df["_score"] = df.apply(score_row, axis=1)
    matched = df[df["_score"] > 0].sort_values("_score", ascending=False)

    # If we have high-scoring matches (constituency-level), prefer those
    if not matched.empty:
        top_score = matched["_score"].iloc[0]
        if top_score >= 5:
            # Only include rows that are close to the best match
            matched = matched[matched["_score"] >= 5]

    df.drop(columns=["_score"], inplace=True)

    if matched.empty:
        summary_lines = [f"Total constituencies: {len(df)}"]
        summary_lines.append(f"States: {', '.join(STATES)}")
        for yr in YEARS:
            wc = f"WINNING_CAND_AC_{yr}"
            wp = f"WINNER_PARTY_AC_{yr}"
            if wc in df.columns and wp in df.columns:
                top = df[wp].value_counts().head(3)
                summary_lines.append(f"{yr} top parties: " + ", ".join(f"{p}({n})" for p, n in top.items()))
        return "\n".join(summary_lines)

    subset = matched[use_cols].head(20)  
    return subset.to_string(index=False)


# Picks one row and formats all 4 years neatly
def row_to_quiz_context(row: dict) -> str:
    lines = [
        f"Constituency: {row.get('NAME_AC')} ({row.get('TYPE_AC', '')})",
        f"State: {row.get('STATE_AC')}",
        f"District: {row.get('DISTRICT_AC')}",
        f"Parliamentary constituency: {row.get('NAME_PC')}",
        f"Sitting MLA: {row.get('SITTING_MLA_NAME_AC')} ({row.get('SITTING_MLA_PARTY_AC')})",
        "",
    ]
    for yr in YEARS:
        w  = row.get(f"WINNING_CAND_AC_{yr}")
        wp = row.get(f"WINNER_PARTY_AC_{yr}")
        r  = row.get(f"RUNNERSUP_CAND_AC_{yr}")
        rp = row.get(f"RUNNERSUP_PARTY_AC_{yr}")
        ph = row.get(f"POLL_PHASE_AC_{yr}")
        pd_ = row.get(f"POLL_DATE_AC_{yr}")
        if w or r:
            lines.append(f"{yr}: Winner={w} ({wp}) | Runner-up={r} ({rp}) | Phase={ph} | Poll date={pd_}")
    return "\n".join(lines)


class ChatRequest(BaseModel):
    session_id: str
    question: str

class QuizRequest(BaseModel):
    difficulty: str = "easy"
    state: Optional[str] = None
    year: Optional[str] = "2021"     # which election year to quiz on

class AnswerCheckRequest(BaseModel):
    correct_answer: str
    user_answer: str
    difficulty: str = "easy"


@app.post("/chat")
def chat(req: ChatRequest):
    history  = get_history(req.session_id)
    context  = build_data_context(req.question)

    system = """You are a helpful Indian election data assistant covering state assembly elections for 2011, 2016, 2021, and 2026.
For specific constituency results, sitting MLAs, or election data, use ONLY the election data provided below each message. If the data doesn't contain the answer, say "I don't have that in the dataset."
For general knowledge questions about Indian elections (e.g., "when is the next election?"), you may use your general knowledge to answer.
Keep answers to 4–5 lines. Never invent names, parties, or dates for specific constituencies."""

    messages = history.copy()
    messages.append({
        "role": "user",
        "content": f"--- Relevant election data ---\n{context}\n-----------------------------\n\nQuestion: {req.question}"
    })

    groq_messages = [{"role": "system", "content": system}] + messages
    resp   = client.chat.completions.create(model="llama-3.1-8b-instant", max_tokens=400, messages=groq_messages)
    answer = resp.choices[0].message.content
    save_turn(req.session_id, req.question, answer)
    return {"answer": answer, "session_id": req.session_id}


@app.post("/quiz/question")
def quiz_question(req: QuizRequest):
    yr = req.year or "2021"

    winner_col = f"WINNING_CAND_AC_{yr}"
    pool = df.copy()
    if req.state:
        pool = pool[pool["STATE_AC"] == req.state]
    pool = pool[pool[winner_col].notna()]

    if pool.empty:
        raise HTTPException(status_code=404, detail=f"No data for state={req.state} year={yr}")

    row = pool.sample(1).iloc[0].to_dict()
    context = row_to_quiz_context(row)
    points  = {"easy": 1, "medium": 2, "hard": 3}.get(req.difficulty, 1)

    diff_guide = {
        "easy":   f"Ask who won or which party won {yr} election in this constituency. Straightforward.",
        "medium": f"Ask about the runner-up in {yr}, or the poll phase/date, or the sitting MLA.",
        "hard":   f"Ask across years — e.g. which party won both {yr} and 2016, or who was runner-up twice, or compare winning margins across years."
    }

    prompt = f"""You are a quiz master for an Indian state assembly election quiz.
Using ONLY the data below, generate exactly ONE question.

{context}

Difficulty: {req.difficulty}
Guide: {diff_guide[req.difficulty]}

Rules:
- One sentence question
- Answer must be a single name, party, year, or date
- Provide a helpful hint that doesn't give the answer away
- Base question primarily on the {yr} election unless difficulty is hard

Return ONLY raw JSON with no markdown formatting and no extra text.
{{"question":"...","answer":"...","hint":"...","points":{points}}}"""

    resp = client.chat.completions.create(
        model="llama-3.1-8b-instant", max_tokens=300,
        messages=[{"role": "user", "content": prompt}]
    )
    raw  = resp.choices[0].message.content.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()
    data = json.loads(raw)
    data["row"] = {
        "name_ac":  row.get("NAME_AC"),
        "state":    row.get("STATE_AC"),
        "district": row.get("DISTRICT_AC"),
        "winner":   row.get(winner_col),
        "winner_party": row.get(f"WINNER_PARTY_AC_{yr}"),
        "runnerup": row.get(f"RUNNERSUP_CAND_AC_{yr}"),
        "runnerup_party": row.get(f"RUNNERSUP_PARTY_AC_{yr}"),
        "year": yr,
    }
    return data



@app.post("/quiz/check")
def quiz_check(req: AnswerCheckRequest):
    correct  = req.correct_answer.strip().lower()
    player   = req.user_answer.strip().lower()

    
    def is_match(c, p):
        if c == p:
            return True
        # Partial name match: player typed a word that appears in correct answer
        if any(word in c for word in p.split() if len(word) > 2):
            return True
        # Correct answer is a substring of player's answer or vice versa
        if p in c or c in p:
            return True
        # Allow 1-character typo (simple Levenshtein approximation)
        if len(c) > 3 and sum(a != b for a, b in zip(c, p)) <= 1 and abs(len(c) - len(p)) <= 1:
            return True
        return False

    matched = is_match(correct, player)
    if matched:
        message = f"✅ Correct! The answer is: {req.correct_answer}"
    else:
        message = f"❌ Not quite. The correct answer is: {req.correct_answer}"

    return {"correct": matched, "message": message}


@app.get("/health")
def health():
    year_counts = {}
    for yr in YEARS:
        col = f"WINNING_CAND_AC_{yr}"
        if col in df.columns:
            year_counts[yr] = int(df[col].notna().sum())
    return {
        "status": "ok",
        "total_constituencies": len(df),
        "states": STATES,
        "data_by_year": year_counts,
        "columns_loaded": list(df.columns),
    }

@app.get("/stats/{year}")
def stats(year: str, state: Optional[str] = None):
    if year not in YEARS:
        raise HTTPException(status_code=400, detail=f"Year must be one of {YEARS}")
    col = f"WINNER_PARTY_AC_{year}"
    if col not in df.columns:
        raise HTTPException(status_code=404, detail="Column not found")
    data = df.copy()
    if state:
        data = data[data["STATE_AC"] == state]
    tally = data[col].value_counts().dropna().to_dict()
    return {"year": year, "state": state or "all", "seat_tally": tally}

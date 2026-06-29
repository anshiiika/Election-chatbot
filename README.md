# Election Chatbot — Phase 1 Setup Guide

## Folder structure
```
election_chatbot/
├── backend/
│   ├── main.py              ← FastAPI server (all routes)
│   ├── requirements.txt     ← Python dependencies
│   ├── .env.example         ← copy to .env and add your API key
│   └── election_data.xlsx   ← YOUR Excel file goes here
└── frontend/
    ├── src/
│   │   ├── App.jsx          ← Chat + Quiz UI
│   │   ├── main.jsx         ← React entry point
│   │   └── index.css        ← Tailwind imports
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── postcss.config.js
```

---

## Step 1 — Add your Excel file
Copy your Excel file into the `backend/` folder and name it:
```
election_data.xlsx
```
Your Excel must have these columns IN THIS ORDER:
| state | district | constituency | winner | winner_party | runnerup | runnerup_party |

If your column names are different, edit line 16–25 in `main.py`:
```python
df.columns = [
    "state",
    "district",
    "constituency",
    "winner",
    "winner_party",
    "runnerup",
    "runnerup_party",
]
```

---

## Step 2 — Backend setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Add your Anthropic API key
cp .env.example .env
# Open .env and paste your key: ANTHROPIC_API_KEY=sk-ant-...

# Start the server
export ANTHROPIC_API_KEY=sk-ant-your-key-here
uvicorn main:app --reload --port 8000
```

Server runs at: http://localhost:8000
API docs at:    http://localhost:8000/docs

---

## Step 3 — Frontend setup
Open a NEW terminal tab:
```bash
cd frontend
npm install
npm run dev
```

App runs at: http://localhost:3000

---

## Step 4 — Test it works
Visit http://localhost:8000/health — you should see:
```json
{
  "status": "ok",
  "rows_loaded": 250,
  "states": ["Uttar Pradesh", "Bihar", "Maharashtra", ...]
}
```

---

## API endpoints (all POST except /health)

| Endpoint | Body | What it does |
|---|---|---|
| GET /health | — | Check server + data loaded |
| POST /chat | `{session_id, question}` | Q&A with history |
| POST /quiz/question | `{difficulty, state}` | AI generates a question |
| POST /quiz/check | `{correct_answer, user_answer, difficulty}` | AI evaluates answer |

---

## Common errors

**`KeyError` on startup** — Your Excel column names don't match.
Fix: Open main.py line 16, change column names to match your Excel headers.

**`Module not found`** — Run `pip install -r requirements.txt` again inside venv.

**CORS error in browser** — Make sure frontend runs on port 3000 and backend on 8000.

**`ANTHROPIC_API_KEY not set`** — Export the key before running uvicorn.

# VoteFlow

Free, beautiful online voting platform. A modern alternative to OpaVote.

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Auth:** JWT

## Voting methods supported
- Plurality (First Past the Post)
- Ranked Choice / IRV (Instant Runoff Voting)
- Approval Voting
- Condorcet (Schulze/Copeland fallback)

## Getting started

### 1. Install backend dependencies
```bash
cd backend
npm install
```

### 2. Install frontend dependencies
```bash
cd frontend
npm install
```

### 3. Run both (in separate terminals)
```bash
# Terminal 1 — backend
cd backend
npm run dev      # or: node server.js

# Terminal 2 — frontend
cd frontend
npm run dev
```

The app will be at **http://localhost:5173**
The API runs at **http://localhost:3001**

## Environment variables (backend)

Create `backend/.env`:
```
PORT=3001
JWT_SECRET=your-secret-here
FRONTEND_URL=http://localhost:5173
```

## Project structure
```
voteflow/
├── backend/
│   ├── server.js              # Express entry point
│   ├── db/
│   │   ├── schema.sql         # Database schema
│   │   └── database.js        # SQLite connection
│   ├── routes/
│   │   ├── auth.js            # Register / login / me
│   │   ├── elections.js       # CRUD elections, candidates, voters
│   │   └── votes.js           # Voter ballot access & submission
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   └── utils/
│       ├── voting-methods.js  # Plurality, IRV, Approval, Condorcet
│       └── tokens.js          # Voter token & slug generation
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.jsx          # Landing page
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx     # My elections list
        │   ├── CreateElection.jsx # 2-step wizard
        │   ├── ElectionAdmin.jsx  # Manage candidates/voters/status
        │   ├── Ballot.jsx        # Voter-facing ballot
        │   └── Results.jsx       # Results with round-by-round breakdown
        ├── components/
        │   └── Layout.jsx
        ├── hooks/
        │   └── useAuth.js
        └── api.js
```

## Next steps (Claude Code)
- [ ] Email sending (nodemailer) — send voters their unique links
- [ ] Write-in candidates
- [ ] Election scheduling (auto open/close)
- [ ] CSV voter import
- [ ] Shareable public results page
- [ ] Deploy to Railway / Fly.io / Vercel

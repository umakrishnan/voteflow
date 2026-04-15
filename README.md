# VoTally

Simple, secure online voting. Run fair elections for any organization — with multi-question ballots, voter email invites, and transparent results.

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL
- **Auth:** JWT
- **Email:** Resend

## Voting methods supported
- Plurality (First Past the Post)
- Ranked Choice / IRV (Instant Runoff Voting)
- Approval Voting
- Condorcet (Copeland)

## Getting started

### Prerequisites
- Node.js 18+
- PostgreSQL running locally (e.g. `brew install postgresql@16`)

### 1. Install dependencies
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure backend environment

Create `backend/.env`:
```
PORT=3001
JWT_SECRET=your-strong-random-secret   # generate: openssl rand -hex 32
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://localhost/votally
RESEND_API_KEY=re_your_api_key_here    # from resend.com (optional for local dev)
FROM_EMAIL=voting@votally.xyz
```

Create the local database:
```bash
createdb votally
```

The schema is applied automatically on first run.

### 3. Run both servers (separate terminals)
```bash
# Terminal 1 — backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend && npm run dev
```

## Project structure
```
votally/
├── backend/
│   ├── server.js              # Express entry point
│   ├── db/
│   │   ├── schema.sql         # PostgreSQL schema
│   │   └── database.js        # pg Pool connection + initSchema
│   ├── routes/
│   │   ├── auth.js            # Register / login / me
│   │   ├── elections.js       # Elections, questions, options, voters, results
│   │   └── votes.js           # Voter ballot access & submission (rate limited)
│   ├── middleware/
│   │   └── auth.js            # JWT middleware (requires JWT_SECRET env var)
│   └── utils/
│       ├── voting-methods.js  # Plurality, IRV, Approval, Condorcet
│       └── tokens.js          # Voter token & election slug generation
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.jsx           # Landing page
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx      # My elections list
        │   ├── CreateElection.jsx # Create election (title, description, color)
        │   ├── ElectionAdmin.jsx  # Questions / Voters / Settings tabs
        │   ├── Ballot.jsx         # Voter-facing multi-question ballot
        │   └── Results.jsx        # Per-question results and winner breakdown
        ├── components/
        │   └── Layout.jsx
        ├── hooks/
        │   └── useAuth.js
        └── api.js                 # Axios instance with JWT injection
```

## Election lifecycle
`draft` → `open` → `closed`

- Build questions and add voters while in **draft**
- Open the election to send voter invite emails and accept ballots
- Each voter gets a unique token link — one vote per person
- Close when done; results are available at any stage

## Voter CSV import
In the Voters tab, click **Upload CSV**. Expected format:
```
email,name
alice@example.com,Alice Smith
bob@example.com,Bob Jones
```
The header row is optional and auto-detected. Name column is optional.

## Production deployment (Railway)

The app is deployed on Railway with separate services for backend, frontend, and Postgres.

Required backend environment variables in Railway:
```
JWT_SECRET        # strong random secret — never use a default
DATABASE_URL      # set automatically by Railway Postgres plugin
FRONTEND_URL      # your frontend Railway URL or custom domain
RESEND_API_KEY    # from resend.com
FROM_EMAIL        # verified sender address
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VoteFlow is a full-stack online voting platform supporting multiple voting methods (Plurality, IRV, Approval, Condorcet). It has a React/Vite frontend and a Node.js/Express backend with SQLite.

## Development Commands

### Setup
```bash
cd backend && npm install
cd frontend && npm install
```

### Running (requires two terminals)
```bash
# Backend — http://localhost:3001
cd backend && npm run dev

# Frontend — http://localhost:5173
cd frontend && npm run dev
```

### Production
```bash
cd frontend && npm run build   # outputs to dist/
cd frontend && npm run preview
```

There are no lint or test scripts configured.

### Backend Environment Variables
```
PORT=3001
JWT_SECRET=your-secret-here
FRONTEND_URL=http://localhost:5173
```

## Architecture

### Frontend (`frontend/src/`)
- `main.jsx` → `App.jsx` sets up routing with `AuthProvider` context (from `hooks/useAuth.js`)
- `api.js` — Axios instance that injects the JWT Bearer token on every request; all API calls go through this
- Vite proxies `/api/*` to `http://localhost:3001`, so frontend code never hardcodes the backend URL
- Two route families: **authenticated** (Dashboard, CreateElection, ElectionAdmin, Results) and **public/token-based** (Ballot via voter token)

### Backend (`backend/`)
- `server.js` — Express entry point; mounts routes under `/api/auth`, `/api/elections`, `/api/vote`
- `db/database.js` — Single SQLite connection with WAL mode and foreign keys enabled
- `middleware/auth.js` — JWT verification; attach `req.user` for protected routes
- `utils/voting-methods.js` — All four tabulation algorithms (Plurality, IRV, Approval, Condorcet/Copeland)
- `utils/tokens.js` — nanoid helpers: 32-char voter tokens, 10-char election slugs

### Database Design
Key anonymity decision: `ballots` stores `voter_id` for audit purposes, but results are computed only from `ballot_choices`. The voter record tracks whether they have voted without linking them to specific choices.

Tables: `users`, `elections`, `candidates`, `voters`, `ballots`, `ballot_choices`. Schema in `db/schema.sql`.

### Election Lifecycle
`draft` → `open` → `closed`

- Only `open` elections accept ballot submissions (`POST /api/vote/:token`)
- Results endpoint (`GET /api/elections/:slug/results`) works in all statuses; the `show_results` flag controls public visibility while open

### Voting Methods Flow
`POST /api/vote/:token` writes atomically to `ballots` + `ballot_choices` in a transaction. Results are computed on-the-fly (not cached) in `routes/elections.js` by calling the appropriate function from `voting-methods.js`.

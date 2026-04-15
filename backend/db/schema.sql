-- VoteFlow Database Schema (v2 — multi-question)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  -- status: 'draft' | 'open' | 'closed'
  primary_color TEXT DEFAULT '#6366f1',
  logo_url TEXT,
  -- email invite template (supports {{name}}, {{election_title}}, {{link}} placeholders)
  email_subject TEXT DEFAULT 'Your invitation to vote: {{election_title}}',
  email_body TEXT DEFAULT 'Hi {{name}},

You have been invited to participate in "{{election_title}}".

Click the link below to cast your vote:
{{link}}

This link is unique to you and can only be used once. Do not share it.',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  order_num INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  method TEXT NOT NULL DEFAULT 'plurality',
  -- method: 'plurality' | 'irv' | 'approval' | 'condorcet'
  max_choices INTEGER DEFAULT 1,
  -- for approval voting: max options a voter can select
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  token TEXT UNIQUE NOT NULL,
  voted_at DATETIME,
  email_sent_at DATETIME,
  email_status TEXT DEFAULT 'pending',
  -- 'pending' | 'sent' | 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(election_id, email)
);

CREATE TABLE IF NOT EXISTS ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES voters(id),
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ballot_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ballot_id INTEGER NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  rank INTEGER,
  -- for irv/condorcet: 1 = first choice, 2 = second, etc.
  approved INTEGER DEFAULT 0
  -- for approval: 1 = approved
);

CREATE INDEX IF NOT EXISTS idx_elections_slug ON elections(slug);
CREATE INDEX IF NOT EXISTS idx_elections_owner ON elections(owner_id);
CREATE INDEX IF NOT EXISTS idx_questions_election ON questions(election_id);
CREATE INDEX IF NOT EXISTS idx_candidates_question ON candidates(question_id);
CREATE INDEX IF NOT EXISTS idx_voters_token ON voters(token);
CREATE INDEX IF NOT EXISTS idx_voters_election ON voters(election_id);
CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_ballot_choices_ballot ON ballot_choices(ballot_id);
CREATE INDEX IF NOT EXISTS idx_ballot_choices_question ON ballot_choices(question_id);

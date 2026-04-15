-- VoTally Database Schema (Postgres)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elections (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  primary_color TEXT DEFAULT '#6366f1',
  logo_url TEXT,
  email_subject TEXT DEFAULT 'Your invitation to vote: {{election_title}}',
  email_body TEXT DEFAULT 'Hi {{name}},

You have been invited to participate in "{{election_title}}".

Click the link below to cast your vote:
{{link}}

This link is unique to you and can only be used once. Do not share it.',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  order_num INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  method TEXT NOT NULL DEFAULT 'plurality',
  max_choices INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS voters (
  id SERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  token TEXT UNIQUE NOT NULL,
  voted_at TIMESTAMPTZ,
  email_sent_at TIMESTAMPTZ,
  email_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(election_id, email)
);

CREATE TABLE IF NOT EXISTS ballots (
  id SERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES voters(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ballot_choices (
  id SERIAL PRIMARY KEY,
  ballot_id INTEGER NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  rank INTEGER,
  approved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
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

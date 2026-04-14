-- VoteFlow Database Schema

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
  method TEXT NOT NULL DEFAULT 'plurality',
  -- method: 'plurality' | 'irv' | 'approval' | 'condorcet'
  status TEXT NOT NULL DEFAULT 'draft',
  -- status: 'draft' | 'open' | 'closed'
  starts_at DATETIME,
  ends_at DATETIME,
  max_choices INTEGER DEFAULT 1,
  -- for approval voting: max candidates a voter can select
  allow_write_in INTEGER DEFAULT 0,
  show_results_live INTEGER DEFAULT 0,
  primary_color TEXT DEFAULT '#6366f1',
  logo_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  position INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS voters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  token TEXT UNIQUE NOT NULL,
  -- secure single-use voting token
  voted_at DATETIME,
  email_sent_at DATETIME,
  email_status TEXT DEFAULT 'pending',
  -- 'pending' | 'sent' | 'bounced' | 'opted_out'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(election_id, email)
);

CREATE TABLE IF NOT EXISTS ballots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES voters(id),
  -- Note: ballot choices stored in ballot_choices to preserve anonymity
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ballot_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ballot_id INTEGER NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  rank INTEGER,
  -- for IRV/Condorcet: 1 = first choice, 2 = second, etc.
  -- for approval/plurality: NULL (presence = approval/selection)
  approved INTEGER DEFAULT 0
  -- for approval voting: 1 = approved
);

CREATE INDEX IF NOT EXISTS idx_elections_slug ON elections(slug);
CREATE INDEX IF NOT EXISTS idx_elections_owner ON elections(owner_id);
CREATE INDEX IF NOT EXISTS idx_voters_token ON voters(token);
CREATE INDEX IF NOT EXISTS idx_voters_election ON voters(election_id);
CREATE INDEX IF NOT EXISTS idx_ballots_election ON ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_ballot_choices_ballot ON ballot_choices(ballot_id);

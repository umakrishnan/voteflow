const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateSlug } = require('../utils/tokens');
const { countVotes } = require('../utils/voting-methods');

const router = express.Router();

// GET /api/elections — list my elections
router.get('/', requireAuth, (req, res) => {
  const elections = db
    .prepare(`
      SELECT e.*,
        (SELECT COUNT(*) FROM candidates WHERE election_id = e.id) as candidate_count,
        (SELECT COUNT(*) FROM voters WHERE election_id = e.id) as voter_count,
        (SELECT COUNT(*) FROM voters WHERE election_id = e.id AND voted_at IS NOT NULL) as vote_count
      FROM elections e
      WHERE e.owner_id = ?
      ORDER BY e.created_at DESC
    `)
    .all(req.user.id);
  res.json({ elections });
});

// POST /api/elections — create election
router.post('/', requireAuth, (req, res) => {
  const {
    title, description, method = 'plurality',
    starts_at, ends_at, max_choices = 1,
    allow_write_in = false, show_results_live = false,
    primary_color = '#6366f1'
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });
  const validMethods = ['plurality', 'irv', 'approval', 'condorcet'];
  if (!validMethods.includes(method)) {
    return res.status(400).json({ error: `Method must be one of: ${validMethods.join(', ')}` });
  }

  const slug = generateSlug();
  const result = db.prepare(`
    INSERT INTO elections (slug, owner_id, title, description, method, starts_at, ends_at,
      max_choices, allow_write_in, show_results_live, primary_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(slug, req.user.id, title, description || null, method,
    starts_at || null, ends_at || null,
    max_choices, allow_write_in ? 1 : 0, show_results_live ? 1 : 0, primary_color);

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ election });
});

// GET /api/elections/:slug — get election details (owner)
router.get('/:slug', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const candidates = db.prepare('SELECT * FROM candidates WHERE election_id = ? ORDER BY position, id')
    .all(election.id);
  const voters = db.prepare('SELECT id, email, name, voted_at, email_status, email_sent_at, created_at FROM voters WHERE election_id = ? ORDER BY created_at')
    .all(election.id);

  res.json({ election, candidates, voters });
});

// PATCH /api/elections/:slug — update election
router.patch('/:slug', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const fields = ['title', 'description', 'method', 'starts_at', 'ends_at',
    'max_choices', 'allow_write_in', 'show_results_live', 'primary_color', 'status'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.updated_at = new Date().toISOString();
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), election.id];
  db.prepare(`UPDATE elections SET ${setClause} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM elections WHERE id = ?').get(election.id);
  res.json({ election: updated });
});

// DELETE /api/elections/:slug
router.delete('/:slug', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  db.prepare('DELETE FROM elections WHERE id = ?').run(election.id);
  res.json({ success: true });
});

// --- CANDIDATES ---

// POST /api/elections/:slug/candidates
router.post('/:slug/candidates', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const { name, description, photo_url, position } = req.body;
  if (!name) return res.status(400).json({ error: 'Candidate name is required' });

  const maxPos = db.prepare('SELECT MAX(position) as mp FROM candidates WHERE election_id = ?')
    .get(election.id);
  const pos = position ?? ((maxPos?.mp ?? -1) + 1);

  const result = db.prepare(
    'INSERT INTO candidates (election_id, name, description, photo_url, position) VALUES (?, ?, ?, ?, ?)'
  ).run(election.id, name, description || null, photo_url || null, pos);

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ candidate });
});

// PUT /api/elections/:slug/candidates/:id
router.put('/:slug/candidates/:id', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND election_id = ?')
    .get(req.params.id, election.id);
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

  const { name, description, photo_url, position } = req.body;
  db.prepare('UPDATE candidates SET name = ?, description = ?, photo_url = ?, position = ? WHERE id = ?')
    .run(name ?? candidate.name, description ?? candidate.description,
      photo_url ?? candidate.photo_url, position ?? candidate.position, candidate.id);

  const updated = db.prepare('SELECT * FROM candidates WHERE id = ?').get(candidate.id);
  res.json({ candidate: updated });
});

// DELETE /api/elections/:slug/candidates/:id
router.delete('/:slug/candidates/:id', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  db.prepare('DELETE FROM candidates WHERE id = ? AND election_id = ?')
    .run(req.params.id, election.id);
  res.json({ success: true });
});

// --- VOTERS ---

// POST /api/elections/:slug/voters — add voters (bulk or single)
router.post('/:slug/voters', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const voterList = Array.isArray(req.body.voters) ? req.body.voters : [req.body];
  const { generateVoterToken } = require('../utils/tokens');

  const added = [];
  const skipped = [];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO voters (election_id, email, name, token) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction((voters) => {
    voters.forEach(({ email, name }) => {
      if (!email) return;
      const token = generateVoterToken();
      const result = insert.run(election.id, email.toLowerCase(), name || null, token);
      if (result.changes > 0) {
        added.push({ email, name, token });
      } else {
        skipped.push(email);
      }
    });
  });

  insertMany(voterList);
  res.status(201).json({ added: added.length, skipped: skipped.length, voters: added });
});

// DELETE /api/elections/:slug/voters/:id
router.delete('/:slug/voters/:id', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  db.prepare('DELETE FROM voters WHERE id = ? AND election_id = ?').run(req.params.id, election.id);
  res.json({ success: true });
});

// --- RESULTS ---

// GET /api/elections/:slug/results
router.get('/:slug/results', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const candidates = db.prepare('SELECT * FROM candidates WHERE election_id = ? ORDER BY position, id')
    .all(election.id);

  const rawBallots = db.prepare(`
    SELECT b.id, bc.candidate_id, bc.rank, bc.approved
    FROM ballots b
    JOIN ballot_choices bc ON bc.ballot_id = b.id
    WHERE b.election_id = ?
  `).all(election.id);

  // Group choices by ballot
  const ballotMap = {};
  rawBallots.forEach(row => {
    if (!ballotMap[row.id]) ballotMap[row.id] = { rankings: [], approvedIds: [], candidateId: null };
    if (row.rank !== null) {
      ballotMap[row.id].rankings.push({ candidateId: row.candidate_id, rank: row.rank });
    }
    if (row.approved) {
      ballotMap[row.id].approvedIds.push(row.candidate_id);
    }
    if (!row.rank && !row.approved) {
      ballotMap[row.id].candidateId = row.candidate_id;
    }
  });

  const ballots = Object.values(ballotMap);
  const totalVoters = db.prepare('SELECT COUNT(*) as c FROM voters WHERE election_id = ?').get(election.id).c;
  const turnout = totalVoters > 0 ? ((ballots.length / totalVoters) * 100).toFixed(1) : '0.0';

  const results = countVotes(election.method, ballots, candidates);

  res.json({ ...results, turnout, totalVoters, ballotsCast: ballots.length });
});

module.exports = router;

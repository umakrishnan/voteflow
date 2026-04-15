const express = require('express');
const { Resend } = require('resend');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateSlug, generateVoterToken } = require('../utils/tokens');
const { countVotes } = require('../utils/voting-methods');

const router = express.Router();

// ── ELECTIONS ──────────────────────────────────────────────────────────────

// GET /api/elections — list my elections
router.get('/', requireAuth, (req, res) => {
  const elections = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM questions WHERE election_id = e.id) as question_count,
      (SELECT COUNT(*) FROM voters WHERE election_id = e.id) as voter_count,
      (SELECT COUNT(*) FROM voters WHERE election_id = e.id AND voted_at IS NOT NULL) as vote_count
    FROM elections e
    WHERE e.owner_id = ?
    ORDER BY e.created_at DESC
  `).all(req.user.id);
  res.json({ elections });
});

// POST /api/elections — create election
router.post('/', requireAuth, (req, res) => {
  const { title, description, primary_color = '#6366f1' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const slug = generateSlug();
  const result = db.prepare(`
    INSERT INTO elections (slug, owner_id, title, description, primary_color)
    VALUES (?, ?, ?, ?, ?)
  `).run(slug, req.user.id, title, description || null, primary_color);

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ election });
});

// GET /api/elections/:slug — get election with questions and their options
router.get('/:slug', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE election_id = ? ORDER BY order_num, id')
    .all(election.id);

  const questionIds = questions.map(q => q.id);
  const allOptions = questionIds.length
    ? db.prepare(`SELECT * FROM candidates WHERE question_id IN (${questionIds.map(() => '?').join(',')}) ORDER BY position, id`)
        .all(...questionIds)
    : [];

  // Attach options to each question
  const questionsWithOptions = questions.map(q => ({
    ...q,
    options: allOptions.filter(o => o.question_id === q.id),
  }));

  const voters = db.prepare(`
    SELECT id, email, name, voted_at, email_status, email_sent_at, created_at
    FROM voters WHERE election_id = ? ORDER BY created_at
  `).all(election.id);

  res.json({ election, questions: questionsWithOptions, voters });
});

// PATCH /api/elections/:slug — update election
router.patch('/:slug', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const allowed = ['title', 'description', 'primary_color', 'status', 'email_subject', 'email_body'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  updates.updated_at = new Date().toISOString();
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE elections SET ${setClause} WHERE id = ?`).run(...Object.values(updates), election.id);

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

// ── QUESTIONS ──────────────────────────────────────────────────────────────

// POST /api/elections/:slug/questions
router.post('/:slug/questions', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

  const { title, description, method = 'plurality', max_choices = 1 } = req.body;
  if (!title) return res.status(400).json({ error: 'Question title is required' });

  const validMethods = ['plurality', 'irv', 'approval', 'condorcet'];
  if (!validMethods.includes(method)) return res.status(400).json({ error: 'Invalid voting method' });

  const maxOrder = db.prepare('SELECT MAX(order_num) as mo FROM questions WHERE election_id = ?').get(election.id);
  const order_num = (maxOrder?.mo ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO questions (election_id, order_num, title, description, method, max_choices) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(election.id, order_num, title, description || null, method, max_choices);

  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ question: { ...question, options: [] } });
});

// PUT /api/elections/:slug/questions/:qid
router.put('/:slug/questions/:qid', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND election_id = ?')
    .get(req.params.qid, election.id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const { title, description, method, max_choices, order_num } = req.body;
  db.prepare(`
    UPDATE questions SET
      title = ?, description = ?, method = ?, max_choices = ?, order_num = ?
    WHERE id = ?
  `).run(
    title ?? question.title,
    description ?? question.description,
    method ?? question.method,
    max_choices ?? question.max_choices,
    order_num ?? question.order_num,
    question.id
  );

  const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(question.id);
  const options = db.prepare('SELECT * FROM candidates WHERE question_id = ? ORDER BY position, id').all(question.id);
  res.json({ question: { ...updated, options } });
});

// DELETE /api/elections/:slug/questions/:qid
router.delete('/:slug/questions/:qid', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

  db.prepare('DELETE FROM questions WHERE id = ? AND election_id = ?').run(req.params.qid, election.id);
  res.json({ success: true });
});

// ── OPTIONS (candidates) ───────────────────────────────────────────────────

// POST /api/elections/:slug/questions/:qid/options
router.post('/:slug/questions/:qid/options', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

  const question = db.prepare('SELECT * FROM questions WHERE id = ? AND election_id = ?')
    .get(req.params.qid, election.id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Option name is required' });

  const maxPos = db.prepare('SELECT MAX(position) as mp FROM candidates WHERE question_id = ?').get(question.id);
  const position = (maxPos?.mp ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO candidates (question_id, election_id, name, description, position) VALUES (?, ?, ?, ?, ?)'
  ).run(question.id, election.id, name, description || null, position);

  const option = db.prepare('SELECT * FROM candidates WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ option });
});

// PUT /api/elections/:slug/questions/:qid/options/:oid
router.put('/:slug/questions/:qid/options/:oid', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const option = db.prepare('SELECT * FROM candidates WHERE id = ? AND question_id = ?')
    .get(req.params.oid, req.params.qid);
  if (!option) return res.status(404).json({ error: 'Option not found' });

  const { name, description } = req.body;
  db.prepare('UPDATE candidates SET name = ?, description = ? WHERE id = ?')
    .run(name ?? option.name, description ?? option.description, option.id);

  const updated = db.prepare('SELECT * FROM candidates WHERE id = ?').get(option.id);
  res.json({ option: updated });
});

// DELETE /api/elections/:slug/questions/:qid/options/:oid
router.delete('/:slug/questions/:qid/options/:oid', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  db.prepare('DELETE FROM candidates WHERE id = ? AND question_id = ?')
    .run(req.params.oid, req.params.qid);
  res.json({ success: true });
});

// ── VOTERS ─────────────────────────────────────────────────────────────────

// POST /api/elections/:slug/voters — add voters (bulk)
router.post('/:slug/voters', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const voterList = Array.isArray(req.body.voters) ? req.body.voters : [req.body];
  const added = [];
  const skipped = [];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO voters (election_id, email, name, token) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    voterList.forEach(({ email, name }) => {
      if (!email) return;
      const token = generateVoterToken();
      const r = insert.run(election.id, email.toLowerCase().trim(), name || null, token);
      if (r.changes > 0) added.push({ email, name });
      else skipped.push(email);
    });
  })();

  res.status(201).json({ added: added.length, skipped: skipped.length });
});

// DELETE /api/elections/:slug/voters/:id
router.delete('/:slug/voters/:id', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  db.prepare('DELETE FROM voters WHERE id = ? AND election_id = ?').run(req.params.id, election.id);
  res.json({ success: true });
});

// POST /api/elections/:slug/voters/send-emails — send invite emails via Resend
router.post('/:slug/voters/send-emails', requireAuth, async (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status === 'draft') return res.status(400).json({ error: 'Open the election before sending invites' });

  const { voterIds } = req.body; // optional: send only to specific voters
  let voters;
  if (Array.isArray(voterIds) && voterIds.length > 0) {
    voters = db.prepare(
      `SELECT * FROM voters WHERE election_id = ? AND id IN (${voterIds.map(() => '?').join(',')})`
    ).all(election.id, ...voterIds);
  } else {
    voters = db.prepare('SELECT * FROM voters WHERE election_id = ? AND voted_at IS NULL')
      .all(election.id);
  }

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
    return res.status(400).json({ error: 'Email sending is not configured. Add RESEND_API_KEY to your .env file.' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  let sent = 0;
  let failed = 0;
  const errors = [];

  const updateVoter = db.prepare(
    "UPDATE voters SET email_status = ?, email_sent_at = CURRENT_TIMESTAMP WHERE id = ?"
  );

  for (const voter of voters) {
    const voteLink = `${frontendUrl}/vote/${voter.token}`;
    const voterName = voter.name || voter.email;

    const subject = (election.email_subject || 'Your invitation to vote: {{election_title}}')
      .replace(/\{\{election_title\}\}/g, election.title)
      .replace(/\{\{name\}\}/g, voterName);

    const bodyText = (election.email_body || 'Hi {{name}},\n\nYou have been invited to vote in "{{election_title}}".\n\nClick here to vote:\n{{link}}')
      .replace(/\{\{election_title\}\}/g, election.title)
      .replace(/\{\{name\}\}/g, voterName)
      .replace(/\{\{link\}\}/g, voteLink);

    const htmlBody = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
      ${bodyText.split('\n').map(line => line ? `<p style="margin:0 0 12px">${line}</p>` : '<br>').join('')}
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Powered by VoTally</p>
    </div>`;

    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'voting@yourdomain.com',
        to: voter.email,
        subject,
        html: htmlBody,
      });
      updateVoter.run('sent', voter.id);
      sent++;
    } catch (err) {
      updateVoter.run('failed', voter.id);
      failed++;
      errors.push({ email: voter.email, error: err.message });
    }
  }

  res.json({ sent, failed, errors });
});

// ── RESULTS ────────────────────────────────────────────────────────────────

// GET /api/elections/:slug/results
router.get('/:slug/results', requireAuth, (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE slug = ? AND owner_id = ?')
    .get(req.params.slug, req.user.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const questions = db.prepare('SELECT * FROM questions WHERE election_id = ? ORDER BY order_num, id')
    .all(election.id);

  const totalVoters = db.prepare('SELECT COUNT(*) as c FROM voters WHERE election_id = ?').get(election.id).c;
  const ballotsCast = db.prepare('SELECT COUNT(*) as c FROM ballots WHERE election_id = ?').get(election.id).c;
  const turnout = totalVoters > 0 ? ((ballotsCast / totalVoters) * 100).toFixed(1) : '0.0';

  const questionResults = questions.map(q => {
    const options = db.prepare('SELECT * FROM candidates WHERE question_id = ? ORDER BY position, id').all(q.id);

    const rawChoices = db.prepare(`
      SELECT bc.ballot_id, bc.candidate_id, bc.rank, bc.approved
      FROM ballot_choices bc
      WHERE bc.question_id = ?
    `).all(q.id);

    // Group by ballot
    const ballotMap = {};
    rawChoices.forEach(row => {
      if (!ballotMap[row.ballot_id]) {
        ballotMap[row.ballot_id] = { rankings: [], approvedIds: [], candidateId: null };
      }
      if (row.rank !== null) {
        ballotMap[row.ballot_id].rankings.push({ candidateId: row.candidate_id, rank: row.rank });
      } else if (row.approved) {
        ballotMap[row.ballot_id].approvedIds.push(row.candidate_id);
      } else {
        ballotMap[row.ballot_id].candidateId = row.candidate_id;
      }
    });

    const ballots = Object.values(ballotMap);
    const result = countVotes(q.method, ballots, options);

    return {
      id: q.id,
      title: q.title,
      description: q.description,
      method: q.method,
      ...result,
    };
  });

  res.json({ questions: questionResults, totalVoters, ballotsCast, turnout });
});

module.exports = router;

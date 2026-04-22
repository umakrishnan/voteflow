const express = require('express');
const { Resend } = require('resend');
const { pool, withTransaction } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateSlug, generateVoterToken } = require('../utils/tokens');
const { countVotes } = require('../utils/voting-methods');

const router = express.Router();

// ── ELECTIONS ──────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*,
        (SELECT COUNT(*) FROM questions WHERE election_id = e.id) as question_count,
        (SELECT COUNT(*) FROM voters WHERE election_id = e.id) as voter_count,
        (SELECT COUNT(*) FROM voters WHERE election_id = e.id AND voted_at IS NOT NULL) as vote_count
      FROM elections e WHERE e.owner_id = $1 ORDER BY e.created_at DESC
    `, [req.user.id]);
    res.json({ elections: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch elections' }); }
});

router.post('/', requireAuth, async (req, res) => {
  const { title, description, primary_color = '#6366f1' } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const slug = generateSlug();
    const result = await pool.query(
      'INSERT INTO elections (slug, owner_id, title, description, primary_color) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [slug, req.user.id, title, description || null, primary_color]
    );
    res.status(201).json({ election: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create election' }); }
});

router.get('/:slug', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const qRes = await pool.query('SELECT * FROM questions WHERE election_id=$1 ORDER BY order_num, id', [election.id]);
    let questionsWithOptions = [];
    if (qRes.rows.length > 0) {
      const qIds = qRes.rows.map(q => q.id);
      const optRes = await pool.query('SELECT * FROM candidates WHERE question_id=ANY($1) ORDER BY position, id', [qIds]);
      questionsWithOptions = qRes.rows.map(q => ({ ...q, options: optRes.rows.filter(o => o.question_id === q.id) }));
    }
    const vRes = await pool.query(
      'SELECT id, email, name, voted_at, email_status, email_sent_at, created_at FROM voters WHERE election_id=$1 ORDER BY created_at',
      [election.id]
    );
    res.json({ election, questions: questionsWithOptions, voters: vRes.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch election' }); }
});

router.patch('/:slug', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const allowed = ['title', 'description', 'primary_color', 'status', 'email_subject', 'email_body'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields to update' });

    updates.updated_at = new Date().toISOString();
    const keys = Object.keys(updates);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE elections SET ${setClause} WHERE id=$${keys.length + 1} RETURNING *`,
      [...Object.values(updates), election.id]
    );
    res.json({ election: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update election' }); }
});

router.delete('/:slug', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT id FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    if (!elRes.rows[0]) return res.status(404).json({ error: 'Election not found' });
    await pool.query('DELETE FROM elections WHERE id=$1', [elRes.rows[0].id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete election' }); }
});

// ── QUESTIONS ──────────────────────────────────────────────────────────────

router.post('/:slug/questions', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

    const { title, description, method = 'plurality', max_choices = 1 } = req.body;
    if (!title) return res.status(400).json({ error: 'Question title is required' });
    if (!['plurality','irv','approval','condorcet'].includes(method)) return res.status(400).json({ error: 'Invalid voting method' });

    const orderRes = await pool.query('SELECT COALESCE(MAX(order_num),-1)+1 as n FROM questions WHERE election_id=$1', [election.id]);
    const result = await pool.query(
      'INSERT INTO questions (election_id, order_num, title, description, method, max_choices) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [election.id, orderRes.rows[0].n, title, description || null, method, max_choices]
    );
    res.status(201).json({ question: { ...result.rows[0], options: [] } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to add question' }); }
});

router.put('/:slug/questions/:qid', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

    const qRes = await pool.query('SELECT * FROM questions WHERE id=$1 AND election_id=$2', [req.params.qid, election.id]);
    const q = qRes.rows[0];
    if (!q) return res.status(404).json({ error: 'Question not found' });

    const { title, description, method, max_choices, order_num } = req.body;
    const result = await pool.query(
      'UPDATE questions SET title=$1,description=$2,method=$3,max_choices=$4,order_num=$5 WHERE id=$6 RETURNING *',
      [title??q.title, description??q.description, method??q.method, max_choices??q.max_choices, order_num??q.order_num, q.id]
    );
    const optRes = await pool.query('SELECT * FROM candidates WHERE question_id=$1 ORDER BY position, id', [q.id]);
    res.json({ question: { ...result.rows[0], options: optRes.rows } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update question' }); }
});

router.delete('/:slug/questions/:qid', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });
    await pool.query('DELETE FROM questions WHERE id=$1 AND election_id=$2', [req.params.qid, election.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete question' }); }
});

// ── OPTIONS ────────────────────────────────────────────────────────────────

router.post('/:slug/questions/:qid/options', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

    const qRes = await pool.query('SELECT id FROM questions WHERE id=$1 AND election_id=$2', [req.params.qid, election.id]);
    if (!qRes.rows[0]) return res.status(404).json({ error: 'Question not found' });

    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Option name is required' });

    const posRes = await pool.query('SELECT COALESCE(MAX(position),-1)+1 as n FROM candidates WHERE question_id=$1', [req.params.qid]);
    const result = await pool.query(
      'INSERT INTO candidates (question_id, election_id, name, description, position) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.qid, election.id, name, description || null, posRes.rows[0].n]
    );
    res.status(201).json({ option: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to add option' }); }
});

router.put('/:slug/questions/:qid/options/:oid', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'draft') return res.status(400).json({ error: 'Cannot modify an open or closed election' });

    // Verify option belongs to a question in this election
    const optRes = await pool.query(
      'SELECT c.* FROM candidates c JOIN questions q ON q.id=c.question_id WHERE c.id=$1 AND c.question_id=$2 AND q.election_id=$3',
      [req.params.oid, req.params.qid, election.id]
    );
    const opt = optRes.rows[0];
    if (!opt) return res.status(404).json({ error: 'Option not found' });

    const { name, description } = req.body;
    const result = await pool.query('UPDATE candidates SET name=$1, description=$2 WHERE id=$3 RETURNING *',
      [name??opt.name, description??opt.description, opt.id]);
    res.json({ option: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to update option' }); }
});

router.delete('/:slug/questions/:qid/options/:oid', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT id FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    // Verify option belongs to a question in this election before deleting
    await pool.query(
      'DELETE FROM candidates WHERE id=$1 AND question_id=$2 AND question_id IN (SELECT id FROM questions WHERE election_id=$3)',
      [req.params.oid, req.params.qid, election.id]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to delete option' }); }
});

// ── VOTERS ─────────────────────────────────────────────────────────────────

router.post('/:slug/voters', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const voterList = Array.isArray(req.body.voters) ? req.body.voters : [req.body];
    let added = 0, skipped = 0;
    await withTransaction(async (client) => {
      for (const { email, name } of voterList) {
        if (!email) continue;
        const r = await client.query(
          'INSERT INTO voters (election_id, email, name, token) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
          [election.id, email.toLowerCase().trim(), name || null, generateVoterToken()]
        );
        if (r.rows.length > 0) added++; else skipped++;
      }
    });
    res.status(201).json({ added, skipped });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to add voters' }); }
});

router.delete('/:slug/voters/:id', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT id FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    if (!elRes.rows[0]) return res.status(404).json({ error: 'Election not found' });
    await pool.query('DELETE FROM voters WHERE id=$1 AND election_id=$2', [req.params.id, elRes.rows[0].id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to remove voter' }); }
});

router.post('/:slug/voters/send-emails', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status === 'draft') return res.status(400).json({ error: 'Open the election before sending invites' });
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_your_api_key_here') {
      return res.status(400).json({ error: 'Email sending is not configured. Add RESEND_API_KEY to your .env file.' });
    }

    const { voterIds } = req.body;
    const voterRes = Array.isArray(voterIds) && voterIds.length
      ? await pool.query('SELECT * FROM voters WHERE election_id=$1 AND id=ANY($2)', [election.id, voterIds])
      : await pool.query('SELECT * FROM voters WHERE election_id=$1 AND voted_at IS NULL', [election.id]);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    let sent = 0, failed = 0;
    const errors = [];

    for (const voter of voterRes.rows) {
      const voteLink = `${frontendUrl}/vote/${voter.token}`;
      const voterName = voter.name || voter.email;
      const subject = (election.email_subject || 'Your invitation to vote: {{election_title}}')
        .replace(/\{\{election_title\}\}/g, election.title).replace(/\{\{name\}\}/g, voterName);
      const bodyText = (election.email_body || '')
        .replace(/\{\{election_title\}\}/g, election.title)
        .replace(/\{\{name\}\}/g, voterName)
        .replace(/\{\{link\}\}/g, voteLink);
      const htmlBody = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        ${bodyText.split('\n').map(l => l ? `<p style="margin:0 0 12px">${l}</p>` : '<br>').join('')}
        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">Powered by VoTally</p>
      </div>`;
      try {
        await resend.emails.send({ from: process.env.FROM_EMAIL || 'voting@votally.xyz', to: voter.email, subject, html: htmlBody });
        await pool.query("UPDATE voters SET email_status='sent', email_sent_at=NOW() WHERE id=$1", [voter.id]);
        sent++;
      } catch (e) {
        await pool.query("UPDATE voters SET email_status='failed' WHERE id=$1", [voter.id]);
        failed++;
        errors.push({ email: voter.email, error: e.message });
      }
    }
    res.json({ sent, failed, errors });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to send emails' }); }
});

// ── RESULTS ────────────────────────────────────────────────────────────────

router.get('/:slug/results', requireAuth, async (req, res) => {
  try {
    const elRes = await pool.query('SELECT * FROM elections WHERE slug=$1 AND owner_id=$2', [req.params.slug, req.user.id]);
    const election = elRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    const qRes = await pool.query('SELECT * FROM questions WHERE election_id=$1 ORDER BY order_num, id', [election.id]);
    const tvRes = await pool.query('SELECT COUNT(*) as c FROM voters WHERE election_id=$1', [election.id]);
    const bcRes = await pool.query('SELECT COUNT(*) as c FROM ballots WHERE election_id=$1', [election.id]);
    const totalVoters = parseInt(tvRes.rows[0].c);
    const ballotsCast = parseInt(bcRes.rows[0].c);
    const turnout = totalVoters > 0 ? ((ballotsCast / totalVoters) * 100).toFixed(1) : '0.0';

    const questionResults = await Promise.all(qRes.rows.map(async (q) => {
      const optRes = await pool.query('SELECT * FROM candidates WHERE question_id=$1 ORDER BY position, id', [q.id]);
      const chRes = await pool.query('SELECT ballot_id, candidate_id, rank, approved FROM ballot_choices WHERE question_id=$1', [q.id]);

      const ballotMap = {};
      chRes.rows.forEach(row => {
        if (!ballotMap[row.ballot_id]) ballotMap[row.ballot_id] = { rankings: [], approvedIds: [], candidateId: null };
        if (row.rank !== null) ballotMap[row.ballot_id].rankings.push({ candidateId: row.candidate_id, rank: row.rank });
        else if (row.approved) ballotMap[row.ballot_id].approvedIds.push(row.candidate_id);
        else ballotMap[row.ballot_id].candidateId = row.candidate_id;
      });

      return { id: q.id, title: q.title, description: q.description, method: q.method,
        ...countVotes(q.method, Object.values(ballotMap), optRes.rows) };
    }));

    res.json({ questions: questionResults, totalVoters, ballotsCast, turnout });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to compute results' }); }
});

module.exports = router;

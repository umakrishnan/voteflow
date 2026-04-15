const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool, withTransaction } = require('../db/database');

const router = express.Router();

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// GET /api/vote/:token
router.get('/:token', async (req, res) => {
  try {
    const vRes = await pool.query('SELECT * FROM voters WHERE token=$1', [req.params.token]);
    const voter = vRes.rows[0];
    if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

    const eRes = await pool.query('SELECT * FROM elections WHERE id=$1', [voter.election_id]);
    const election = eRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });

    if (election.status === 'draft') return res.status(403).json({ error: 'This election has not opened yet' });
    if (election.status === 'closed') return res.status(403).json({ error: 'This election has closed' });
    if (voter.voted_at) return res.status(403).json({ error: 'You have already voted in this election', alreadyVoted: true });

    const qRes = await pool.query('SELECT * FROM questions WHERE election_id=$1 ORDER BY order_num, id', [election.id]);
    const questions = qRes.rows;
    let questionsWithOptions = [];
    if (questions.length > 0) {
      const qIds = questions.map(q => q.id);
      const optRes = await pool.query(
        'SELECT id, question_id, name, description, position FROM candidates WHERE question_id=ANY($1) ORDER BY position, id',
        [qIds]
      );
      questionsWithOptions = questions.map(q => ({
        id: q.id, title: q.title, description: q.description, method: q.method, max_choices: q.max_choices,
        options: optRes.rows.filter(o => o.question_id === q.id),
      }));
    }

    res.json({
      election: { title: election.title, description: election.description, primary_color: election.primary_color },
      questions: questionsWithOptions,
      voter: { name: voter.name, email: voter.email },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to load ballot' }); }
});

// POST /api/vote/:token
router.post('/:token', voteLimiter, async (req, res) => {
  try {
    const vRes = await pool.query('SELECT * FROM voters WHERE token=$1', [req.params.token]);
    const voter = vRes.rows[0];
    if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

    const eRes = await pool.query('SELECT * FROM elections WHERE id=$1', [voter.election_id]);
    const election = eRes.rows[0];
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.status !== 'open') return res.status(403).json({ error: 'This election is not currently open' });
    if (voter.voted_at) return res.status(403).json({ error: 'You have already voted' });

    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length === 0) return res.status(400).json({ error: 'No answers provided' });

    const qRes = await pool.query('SELECT * FROM questions WHERE election_id=$1 ORDER BY order_num, id', [election.id]);
    const questions = qRes.rows;
    if (answers.length !== questions.length) return res.status(400).json({ error: 'You must answer all questions' });

    // Validate all answers before writing anything
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      if (!question) return res.status(400).json({ error: `Invalid question id: ${answer.questionId}` });

      const optRes = await pool.query('SELECT id FROM candidates WHERE question_id=$1', [question.id]);
      const validIds = new Set(optRes.rows.map(c => c.id));

      if (question.method === 'plurality') {
        if (!answer.candidateId || !validIds.has(answer.candidateId))
          return res.status(400).json({ error: `Invalid selection for "${question.title}"` });
      } else if (question.method === 'irv' || question.method === 'condorcet') {
        if (!Array.isArray(answer.rankings) || answer.rankings.length === 0)
          return res.status(400).json({ error: `Please rank at least one option for "${question.title}"` });
        for (const r of answer.rankings) {
          if (!validIds.has(r.candidateId)) return res.status(400).json({ error: `Invalid candidate in rankings for "${question.title}"` });
          if (typeof r.rank !== 'number' || r.rank < 1) return res.status(400).json({ error: `Invalid rank value for "${question.title}"` });
        }
        const ranks = answer.rankings.map(r => r.rank);
        if (new Set(ranks).size !== ranks.length) return res.status(400).json({ error: `Duplicate ranks in "${question.title}"` });
      } else if (question.method === 'approval') {
        if (!Array.isArray(answer.approvedIds)) return res.status(400).json({ error: `Invalid approval choices for "${question.title}"` });
        if (answer.approvedIds.length > (question.max_choices || validIds.size))
          return res.status(400).json({ error: `Too many selections for "${question.title}"` });
        for (const id of answer.approvedIds)
          if (!validIds.has(id)) return res.status(400).json({ error: `Invalid option in approvedIds for "${question.title}"` });
      }
    }

    // Write ballot in a single transaction
    await withTransaction(async (client) => {
      const bRes = await client.query('INSERT INTO ballots (election_id, voter_id) VALUES ($1,$2) RETURNING id', [election.id, voter.id]);
      const ballotId = bRes.rows[0].id;

      for (const answer of answers) {
        const question = questions.find(q => q.id === answer.questionId);
        if (question.method === 'plurality') {
          await client.query('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id) VALUES ($1,$2,$3)',
            [ballotId, question.id, answer.candidateId]);
        } else if (question.method === 'irv' || question.method === 'condorcet') {
          for (const { candidateId, rank } of answer.rankings)
            await client.query('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id, rank) VALUES ($1,$2,$3,$4)',
              [ballotId, question.id, candidateId, rank]);
        } else if (question.method === 'approval') {
          for (const id of answer.approvedIds)
            await client.query('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id, approved) VALUES ($1,$2,$3,1)',
              [ballotId, question.id, id]);
        }
      }
      await client.query('UPDATE voters SET voted_at=NOW() WHERE id=$1', [voter.id]);
    });

    res.json({ success: true, message: 'Your vote has been recorded. Thank you!' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to submit vote' }); }
});

module.exports = router;

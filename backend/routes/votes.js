const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/vote/:token — get ballot info for voter
router.get('/:token', (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE token = ?').get(req.params.token);
  if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(voter.election_id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  if (election.status === 'draft') return res.status(403).json({ error: 'This election has not opened yet' });
  if (election.status === 'closed') return res.status(403).json({ error: 'This election has closed' });
  if (voter.voted_at) return res.status(403).json({ error: 'You have already voted in this election', alreadyVoted: true });

  const questions = db.prepare('SELECT * FROM questions WHERE election_id = ? ORDER BY order_num, id')
    .all(election.id);

  const questionIds = questions.map(q => q.id);
  const allOptions = questionIds.length
    ? db.prepare(`SELECT id, question_id, name, description, position FROM candidates WHERE question_id IN (${questionIds.map(() => '?').join(',')}) ORDER BY position, id`)
        .all(...questionIds)
    : [];

  const questionsWithOptions = questions.map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    method: q.method,
    max_choices: q.max_choices,
    options: allOptions.filter(o => o.question_id === q.id),
  }));

  res.json({
    election: {
      title: election.title,
      description: election.description,
      primary_color: election.primary_color,
      ends_at: election.ends_at,
    },
    questions: questionsWithOptions,
    voter: { name: voter.name, email: voter.email },
  });
});

// POST /api/vote/:token — submit ballot
router.post('/:token', (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE token = ?').get(req.params.token);
  if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(voter.election_id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  if (election.status !== 'open') return res.status(403).json({ error: 'This election is not currently open' });
  if (voter.voted_at) return res.status(403).json({ error: 'You have already voted' });

  const { answers } = req.body;
  // answers: [{ questionId, candidateId? | rankings? | approvedIds? }]
  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'No answers provided' });
  }

  const questions = db.prepare('SELECT * FROM questions WHERE election_id = ? ORDER BY order_num, id')
    .all(election.id);

  if (answers.length !== questions.length) {
    return res.status(400).json({ error: 'You must answer all questions' });
  }

  // Validate each answer
  for (const answer of answers) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) return res.status(400).json({ error: `Invalid question id: ${answer.questionId}` });

    const validOptionIds = new Set(
      db.prepare('SELECT id FROM candidates WHERE question_id = ?').all(question.id).map(c => c.id)
    );

    if (question.method === 'plurality') {
      if (!answer.candidateId || !validOptionIds.has(answer.candidateId)) {
        return res.status(400).json({ error: `Invalid selection for "${question.title}"` });
      }
    } else if (question.method === 'irv' || question.method === 'condorcet') {
      if (!Array.isArray(answer.rankings) || answer.rankings.length === 0) {
        return res.status(400).json({ error: `Please rank candidates for "${question.title}"` });
      }
      for (const r of answer.rankings) {
        if (!validOptionIds.has(r.candidateId)) {
          return res.status(400).json({ error: `Invalid candidate in rankings for "${question.title}"` });
        }
        if (typeof r.rank !== 'number' || r.rank < 1) {
          return res.status(400).json({ error: `Invalid rank value for "${question.title}"` });
        }
      }
      const ranks = answer.rankings.map(r => r.rank);
      if (new Set(ranks).size !== ranks.length) {
        return res.status(400).json({ error: `Duplicate ranks in "${question.title}"` });
      }
    } else if (question.method === 'approval') {
      if (!Array.isArray(answer.approvedIds)) {
        return res.status(400).json({ error: `Invalid approval choices for "${question.title}"` });
      }
      const maxChoices = question.max_choices || validOptionIds.size;
      if (answer.approvedIds.length > maxChoices) {
        return res.status(400).json({ error: `You can approve at most ${maxChoices} option(s) for "${question.title}"` });
      }
      for (const id of answer.approvedIds) {
        if (!validOptionIds.has(id)) {
          return res.status(400).json({ error: `Invalid option in approvedIds for "${question.title}"` });
        }
      }
    }
  }

  // Submit ballot in a single transaction
  db.transaction(() => {
    const ballotResult = db.prepare(
      'INSERT INTO ballots (election_id, voter_id) VALUES (?, ?)'
    ).run(election.id, voter.id);
    const ballotId = ballotResult.lastInsertRowid;

    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);

      if (question.method === 'plurality') {
        db.prepare('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id) VALUES (?, ?, ?)')
          .run(ballotId, question.id, answer.candidateId);
      } else if (question.method === 'irv' || question.method === 'condorcet') {
        answer.rankings.forEach(({ candidateId, rank }) => {
          db.prepare('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id, rank) VALUES (?, ?, ?, ?)')
            .run(ballotId, question.id, candidateId, rank);
        });
      } else if (question.method === 'approval') {
        answer.approvedIds.forEach(id => {
          db.prepare('INSERT INTO ballot_choices (ballot_id, question_id, candidate_id, approved) VALUES (?, ?, ?, 1)')
            .run(ballotId, question.id, id);
        });
      }
    }

    db.prepare('UPDATE voters SET voted_at = CURRENT_TIMESTAMP WHERE id = ?').run(voter.id);
  })();

  res.json({ success: true, message: 'Your vote has been recorded. Thank you!' });
});

module.exports = router;

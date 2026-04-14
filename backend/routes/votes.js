const express = require('express');
const db = require('../db/database');

const router = express.Router();

// GET /api/vote/:token — get ballot info for voter
router.get('/:token', (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE token = ?').get(req.params.token);
  if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(voter.election_id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  if (election.status === 'draft') {
    return res.status(403).json({ error: 'This election has not opened yet' });
  }
  if (election.status === 'closed') {
    return res.status(403).json({ error: 'This election has closed' });
  }
  if (voter.voted_at) {
    return res.status(403).json({ error: 'You have already voted in this election', alreadyVoted: true });
  }

  const candidates = db.prepare('SELECT id, name, description, photo_url, position FROM candidates WHERE election_id = ? ORDER BY position, id')
    .all(election.id);

  // Don't expose sensitive info
  const publicElection = {
    title: election.title,
    description: election.description,
    method: election.method,
    max_choices: election.max_choices,
    primary_color: election.primary_color,
    logo_url: election.logo_url,
    ends_at: election.ends_at,
  };

  const voterInfo = {
    name: voter.name,
    email: voter.email,
  };

  res.json({ election: publicElection, candidates, voter: voterInfo });
});

// POST /api/vote/:token — submit ballot
router.post('/:token', (req, res) => {
  const voter = db.prepare('SELECT * FROM voters WHERE token = ?').get(req.params.token);
  if (!voter) return res.status(404).json({ error: 'Invalid voting link' });

  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(voter.election_id);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  if (election.status !== 'open') {
    return res.status(403).json({ error: 'This election is not currently open' });
  }
  if (voter.voted_at) {
    return res.status(403).json({ error: 'You have already voted' });
  }

  const { choices } = req.body;
  // choices format depends on method:
  // plurality: { candidateId: number }
  // irv/condorcet: { rankings: [{candidateId, rank}] }
  // approval: { approvedIds: [number] }

  if (!choices) return res.status(400).json({ error: 'No choices provided' });

  const candidates = db.prepare('SELECT id FROM candidates WHERE election_id = ?').all(election.id);
  const validIds = new Set(candidates.map(c => c.id));

  // Validate choices
  const validatePluralityChoice = () => {
    if (!choices.candidateId || !validIds.has(choices.candidateId)) {
      return 'Invalid candidate selection';
    }
    return null;
  };

  const validateRankedChoices = () => {
    if (!Array.isArray(choices.rankings) || choices.rankings.length === 0) {
      return 'Rankings are required';
    }
    for (const r of choices.rankings) {
      if (!validIds.has(r.candidateId)) return 'Invalid candidate in rankings';
      if (typeof r.rank !== 'number' || r.rank < 1) return 'Invalid rank value';
    }
    // Check for duplicate ranks
    const ranks = choices.rankings.map(r => r.rank);
    if (new Set(ranks).size !== ranks.length) return 'Duplicate ranks are not allowed';
    return null;
  };

  const validateApprovalChoices = () => {
    if (!Array.isArray(choices.approvedIds)) return 'approvedIds must be an array';
    const maxChoices = election.max_choices || candidates.length;
    if (choices.approvedIds.length > maxChoices) {
      return `You can approve at most ${maxChoices} candidate(s)`;
    }
    for (const id of choices.approvedIds) {
      if (!validIds.has(id)) return 'Invalid candidate in approvedIds';
    }
    return null;
  };

  let validationError = null;
  if (election.method === 'plurality') validationError = validatePluralityChoice();
  else if (election.method === 'irv' || election.method === 'condorcet') validationError = validateRankedChoices();
  else if (election.method === 'approval') validationError = validateApprovalChoices();

  if (validationError) return res.status(400).json({ error: validationError });

  // Submit ballot in a transaction
  const submitBallot = db.transaction(() => {
    const ballotResult = db.prepare(
      'INSERT INTO ballots (election_id, voter_id) VALUES (?, ?)'
    ).run(election.id, voter.id);

    const ballotId = ballotResult.lastInsertRowid;

    if (election.method === 'plurality') {
      db.prepare('INSERT INTO ballot_choices (ballot_id, candidate_id) VALUES (?, ?)')
        .run(ballotId, choices.candidateId);
    } else if (election.method === 'irv' || election.method === 'condorcet') {
      choices.rankings.forEach(({ candidateId, rank }) => {
        db.prepare('INSERT INTO ballot_choices (ballot_id, candidate_id, rank) VALUES (?, ?, ?)')
          .run(ballotId, candidateId, rank);
      });
    } else if (election.method === 'approval') {
      choices.approvedIds.forEach(id => {
        db.prepare('INSERT INTO ballot_choices (ballot_id, candidate_id, approved) VALUES (?, ?, 1)')
          .run(ballotId, id);
      });
    }

    // Mark voter as having voted
    db.prepare('UPDATE voters SET voted_at = CURRENT_TIMESTAMP WHERE id = ?').run(voter.id);
  });

  submitBallot();
  res.json({ success: true, message: 'Your vote has been recorded. Thank you for voting!' });
});

module.exports = router;

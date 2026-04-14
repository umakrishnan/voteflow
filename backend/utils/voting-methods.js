/**
 * VoteFlow Voting Methods Engine
 * Supports: Plurality, Instant Runoff (IRV), Approval, Condorcet (Schulze)
 */

/**
 * Plurality (First Past the Post)
 * Each voter selects one candidate. Most votes wins.
 * @param {Array} ballots - [{candidateId}]
 * @param {Array} candidates - [{id, name}]
 */
function plurality(ballots, candidates) {
  const counts = {};
  candidates.forEach(c => (counts[c.id] = 0));

  ballots.forEach(ballot => {
    if (ballot.candidateId && counts[ballot.candidateId] !== undefined) {
      counts[ballot.candidateId]++;
    }
  });

  const totalVotes = ballots.length;
  const results = candidates
    .map(c => ({
      id: c.id,
      name: c.name,
      votes: counts[c.id],
      percentage: totalVotes > 0 ? ((counts[c.id] / totalVotes) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => b.votes - a.votes);

  return {
    method: 'plurality',
    winner: results[0]?.votes > 0 ? results[0] : null,
    results,
    totalVotes,
    rounds: null,
  };
}

/**
 * Instant Runoff Voting (IRV / Ranked Choice)
 * Voters rank candidates. Lowest vote-getter eliminated each round until
 * a candidate has a majority.
 * @param {Array} ballots - [{rankings: [{candidateId, rank}]}]
 * @param {Array} candidates - [{id, name}]
 */
function irv(ballots, candidates) {
  const rounds = [];
  let activeCandidates = candidates.map(c => c.id);
  const candidateMap = Object.fromEntries(candidates.map(c => [c.id, c.name]));

  // Each ballot is an ordered array of candidate IDs (first choice first)
  let activeBallots = ballots.map(b =>
    b.rankings
      .sort((a, b) => a.rank - b.rank)
      .map(r => r.candidateId)
  );

  while (activeCandidates.length > 1) {
    const counts = {};
    activeCandidates.forEach(id => (counts[id] = 0));

    // Count first-choice votes among still-active candidates
    activeBallots.forEach(ballot => {
      const topChoice = ballot.find(id => activeCandidates.includes(id));
      if (topChoice !== undefined) counts[topChoice]++;
    });

    const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
    const roundResults = activeCandidates
      .map(id => ({
        id,
        name: candidateMap[id],
        votes: counts[id],
        percentage: totalVotes > 0 ? ((counts[id] / totalVotes) * 100).toFixed(1) : '0.0',
        eliminated: false,
      }))
      .sort((a, b) => b.votes - a.votes);

    // Check for majority winner
    const leader = roundResults[0];
    if (leader.votes > totalVotes / 2) {
      rounds.push({ roundNumber: rounds.length + 1, results: roundResults, winner: leader });
      return {
        method: 'irv',
        winner: leader,
        results: roundResults,
        totalVotes: ballots.length,
        rounds,
      };
    }

    // Eliminate candidate(s) with fewest votes (handle ties by eliminating all tied last)
    const minVotes = Math.min(...roundResults.map(r => r.votes));
    const toEliminate = roundResults.filter(r => r.votes === minVotes).map(r => r.id);

    // If eliminating all remaining, it's a tie
    if (toEliminate.length >= activeCandidates.length) {
      roundResults.forEach(r => (r.eliminated = true));
      rounds.push({ roundNumber: rounds.length + 1, results: roundResults, winner: null, tie: true });
      return {
        method: 'irv',
        winner: null,
        tie: true,
        results: roundResults,
        totalVotes: ballots.length,
        rounds,
      };
    }

    toEliminate.forEach(id => {
      const r = roundResults.find(r => r.id === id);
      if (r) r.eliminated = true;
    });
    rounds.push({ roundNumber: rounds.length + 1, results: roundResults, eliminated: toEliminate });
    activeCandidates = activeCandidates.filter(id => !toEliminate.includes(id));
  }

  // Only one candidate left
  const winner = candidates.find(c => c.id === activeCandidates[0]);
  return {
    method: 'irv',
    winner: winner ? { id: winner.id, name: winner.name } : null,
    totalVotes: ballots.length,
    rounds,
  };
}

/**
 * Approval Voting
 * Voters approve any number of candidates. Most approvals wins.
 * @param {Array} ballots - [{approvedIds: [candidateId]}]
 * @param {Array} candidates - [{id, name}]
 */
function approval(ballots, candidates) {
  const counts = {};
  candidates.forEach(c => (counts[c.id] = 0));

  ballots.forEach(ballot => {
    (ballot.approvedIds || []).forEach(id => {
      if (counts[id] !== undefined) counts[id]++;
    });
  });

  const totalVoters = ballots.length;
  const results = candidates
    .map(c => ({
      id: c.id,
      name: c.name,
      votes: counts[c.id],
      approvalRate: totalVoters > 0 ? ((counts[c.id] / totalVoters) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => b.votes - a.votes);

  return {
    method: 'approval',
    winner: results[0]?.votes > 0 ? results[0] : null,
    results,
    totalVoters,
    rounds: null,
  };
}

/**
 * Condorcet Method (using pairwise comparison / Copeland's method for simplicity)
 * A candidate who beats every other candidate head-to-head is the Condorcet winner.
 * Falls back to Copeland score if no Condorcet winner exists.
 * @param {Array} ballots - [{rankings: [{candidateId, rank}]}]
 * @param {Array} candidates - [{id, name}]
 */
function condorcet(ballots, candidates) {
  const ids = candidates.map(c => c.id);
  const candidateMap = Object.fromEntries(candidates.map(c => [c.id, c.name]));

  // pairwise[a][b] = number of voters who prefer a over b
  const pairwise = {};
  ids.forEach(a => {
    pairwise[a] = {};
    ids.forEach(b => { if (a !== b) pairwise[a][b] = 0; });
  });

  ballots.forEach(ballot => {
    const rankMap = {};
    (ballot.rankings || []).forEach(r => { rankMap[r.candidateId] = r.rank; });

    ids.forEach(a => {
      ids.forEach(b => {
        if (a === b) return;
        const rankA = rankMap[a] ?? Infinity;
        const rankB = rankMap[b] ?? Infinity;
        if (rankA < rankB) pairwise[a][b]++;
      });
    });
  });

  // Pairwise wins/losses
  const scores = {};
  ids.forEach(a => {
    scores[a] = { wins: 0, losses: 0, ties: 0, copeland: 0 };
    ids.forEach(b => {
      if (a === b) return;
      const aBeatsB = pairwise[a][b];
      const bBeatsA = pairwise[b][a];
      if (aBeatsB > bBeatsA) { scores[a].wins++; scores[a].copeland += 1; }
      else if (aBeatsB < bBeatsA) { scores[a].losses++; scores[a].copeland -= 1; }
      else { scores[a].ties++; scores[a].copeland += 0.5; }
    });
  });

  // Condorcet winner: beats all others
  const condorcetWinner = ids.find(id => scores[id].wins === ids.length - 1);

  const results = candidates
    .map(c => ({
      id: c.id,
      name: c.name,
      wins: scores[c.id].wins,
      losses: scores[c.id].losses,
      ties: scores[c.id].ties,
      copelandScore: scores[c.id].copeland,
      isCondorcetWinner: c.id === condorcetWinner,
    }))
    .sort((a, b) => b.copelandScore - a.copelandScore);

  const winner = condorcetWinner
    ? candidates.find(c => c.id === condorcetWinner)
    : results[0]; // Copeland fallback

  return {
    method: 'condorcet',
    winner: winner ? { id: winner.id, name: candidateMap[winner.id] || winner.name } : null,
    condorcetWinnerFound: !!condorcetWinner,
    results,
    pairwiseMatrix: pairwise,
    totalVotes: ballots.length,
    rounds: null,
  };
}

/**
 * Main dispatcher
 */
function countVotes(method, ballots, candidates) {
  switch (method) {
    case 'plurality': return plurality(ballots, candidates);
    case 'irv':       return irv(ballots, candidates);
    case 'approval':  return approval(ballots, candidates);
    case 'condorcet': return condorcet(ballots, candidates);
    default: throw new Error(`Unknown voting method: ${method}`);
  }
}

module.exports = { countVotes, plurality, irv, approval, condorcet };

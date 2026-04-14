import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';

export default function BallotPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ready | voted | error | closed
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [voter, setVoter] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Plurality
  const [selectedId, setSelectedId] = useState(null);

  // IRV / Condorcet — drag-to-rank
  const [rankings, setRankings] = useState([]); // [{candidateId, rank}]
  const [unranked, setUnranked] = useState([]);

  // Approval
  const [approved, setApproved] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    api.get(`/vote/${token}`)
      .then(res => {
        setElection(res.data.election);
        setCandidates(res.data.candidates);
        setVoter(res.data.voter);
        setUnranked(res.data.candidates.map(c => c.id));
        setState('ready');
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'Invalid voting link';
        const alreadyVoted = err.response?.data?.alreadyVoted;
        if (alreadyVoted) { setState('voted'); }
        else if (err.response?.status === 403) { setState('closed'); setErrorMsg(msg); }
        else { setState('error'); setErrorMsg(msg); }
      });
  }, [token]);

  const rankCandidate = (candidateId) => {
    if (rankings.find(r => r.candidateId === candidateId)) return;
    const newRank = rankings.length + 1;
    setRankings(r => [...r, { candidateId, rank: newRank }]);
    setUnranked(u => u.filter(id => id !== candidateId));
  };

  const unrankCandidate = (candidateId) => {
    const filtered = rankings.filter(r => r.candidateId !== candidateId)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    setRankings(filtered);
    setUnranked(u => [...u, candidateId]);
  };

  const toggleApproval = (id) => {
    setApproved(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  };

  const buildChoices = () => {
    if (election.method === 'plurality') return { candidateId: selectedId };
    if (election.method === 'irv' || election.method === 'condorcet') return { rankings };
    if (election.method === 'approval') return { approvedIds: approved };
    return {};
  };

  const handleSubmit = async () => {
    // Validate
    if (election.method === 'plurality' && !selectedId) {
      alert('Please select a candidate');
      return;
    }
    if ((election.method === 'irv' || election.method === 'condorcet') && rankings.length === 0) {
      alert('Please rank at least one candidate');
      return;
    }
    if (election.method === 'approval' && approved.length === 0) {
      alert('Please approve at least one candidate');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/vote/${token}`, { choices: buildChoices() });
      setSuccessMsg(res.data.message);
      setState('voted');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit vote');
      setSubmitting(false);
    }
  };

  const primaryColor = election?.primary_color || '#6366f1';
  const candidateMap = Object.fromEntries((candidates || []).map(c => [c.id, c]));

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'voted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm animate-slide-up">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Vote recorded!</h1>
          <p className="text-gray-500 text-sm">{successMsg || 'You have already voted in this election.'}</p>
          <p className="text-xs text-gray-400 mt-4">Powered by VoteFlow</p>
        </div>
      </div>
    );
  }

  if (state === 'error' || state === 'closed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">{state === 'closed' ? '🔒' : '❌'}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{state === 'closed' ? 'Election closed' : 'Invalid link'}</h1>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Colored header bar */}
      <div className="h-1.5" style={{ backgroundColor: primaryColor }} />

      <div className="max-w-lg mx-auto px-4 py-10 animate-slide-up">
        {/* Ballot header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{election.title}</h1>
          {election.description && (
            <p className="text-gray-500 text-sm leading-relaxed">{election.description}</p>
          )}
          {voter?.name && (
            <p className="text-xs text-gray-400 mt-3">Voting as <strong>{voter.name}</strong></p>
          )}
        </div>

        {/* Method instructions */}
        <div className="mb-6 p-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
          {election.method === 'plurality' && '☑️ Select one candidate.'}
          {election.method === 'irv' && '🥇 Click candidates to rank them in order of preference (1st choice first).'}
          {election.method === 'condorcet' && '⚖️ Click candidates to rank them from most to least preferred.'}
          {election.method === 'approval' && '✅ Select all candidates you approve of.'}
        </div>

        {/* IRV / Condorcet ranked ballot */}
        {(election.method === 'irv' || election.method === 'condorcet') && (
          <div className="space-y-4">
            {rankings.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Your ranking</p>
                <div className="space-y-2">
                  {rankings.map((r, i) => (
                    <div key={r.candidateId}
                      className="flex items-center gap-3 p-3 rounded-xl border-2 border-green-300 bg-green-50">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: primaryColor }}>
                        {r.rank}
                      </div>
                      <span className="font-medium text-gray-900 text-sm flex-1">
                        {candidateMap[r.candidateId]?.name}
                      </span>
                      <button onClick={() => unrankCandidate(r.candidateId)}
                        className="text-gray-300 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {unranked.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  {rankings.length > 0 ? 'Remaining candidates' : 'Click to rank'}
                </p>
                <div className="space-y-2">
                  {unranked.map(id => (
                    <button key={id}
                      onClick={() => rankCandidate(id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group">
                      <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 group-hover:border-indigo-400 flex items-center justify-center text-xs text-gray-400 group-hover:text-indigo-400">
                        +
                      </div>
                      <span className="font-medium text-gray-700 text-sm">{candidateMap[id]?.name}</span>
                      {candidateMap[id]?.description && (
                        <span className="text-xs text-gray-400 ml-auto">{candidateMap[id].description}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Plurality ballot */}
        {election.method === 'plurality' && (
          <div className="space-y-2">
            {candidates.map(c => (
              <label key={c.id}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                  ${selectedId === c.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="candidate"
                  value={c.id}
                  checked={selectedId === c.id}
                  onChange={() => setSelectedId(c.id)}
                  className="accent-indigo-500"
                />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                  {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Approval ballot */}
        {election.method === 'approval' && (
          <div className="space-y-2">
            {candidates.map(c => (
              <label key={c.id}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                  ${approved.includes(c.id) ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <input
                  type="checkbox"
                  checked={approved.includes(c.id)}
                  onChange={() => toggleApproval(c.id)}
                  className="accent-green-500 w-4 h-4"
                />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                  {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Submit */}
        <div className="mt-8">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {submitting ? 'Submitting…' : 'Cast my vote →'}
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            Your vote is anonymous and cannot be changed after submission.
          </p>
        </div>
      </div>
    </div>
  );
}

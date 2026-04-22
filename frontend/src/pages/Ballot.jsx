import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { getApiError } from '../utils/apiError';

export function PluralityQuestion({ question, answer, onChange }) {
  return (
    <div className="space-y-2">
      {question.options.map(opt => (
        <label
          key={opt.id}
          className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
            ${answer?.candidateId === opt.id ? 'border-current bg-opacity-5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
          style={answer?.candidateId === opt.id ? { borderColor: 'var(--color)', backgroundColor: 'var(--color-light)' } : {}}
        >
          <input
            type="radio"
            name={`q-${question.id}`}
            value={opt.id}
            checked={answer?.candidateId === opt.id}
            onChange={() => onChange({ candidateId: opt.id })}
          />
          <div>
            <p className="font-medium text-gray-900 text-sm">{opt.name}</p>
            {opt.description && <p className="text-xs text-gray-400">{opt.description}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}

export function RankedQuestion({ question, answer, onChange }) {
  const rankings = answer?.rankings || [];
  const rankedIds = new Set(rankings.map(r => r.candidateId));
  const unranked = question.options.filter(o => !rankedIds.has(o.id));
  const optMap = Object.fromEntries(question.options.map(o => [o.id, o]));

  const rank = (id) => {
    const newRankings = [...rankings, { candidateId: id, rank: rankings.length + 1 }];
    onChange({ rankings: newRankings });
  };

  const unrank = (id) => {
    const filtered = rankings
      .filter(r => r.candidateId !== id)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    onChange({ rankings: filtered });
  };

  return (
    <div className="space-y-4">
      {rankings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Your ranking</p>
          <div className="space-y-2">
            {rankings.map(r => (
              <div key={r.candidateId} className="flex items-center gap-3 p-3 rounded-xl border-2 border-green-300 bg-green-50">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white bg-green-500">
                  {r.rank}
                </div>
                <span className="font-medium text-gray-900 text-sm flex-1">{optMap[r.candidateId]?.name}</span>
                <button onClick={() => unrank(r.candidateId)} className="text-gray-300 hover:text-red-400 transition-colors">
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
            {rankings.length > 0 ? 'Remaining' : 'Click to rank'}
          </p>
          <div className="space-y-2">
            {unranked.map(opt => (
              <button
                key={opt.id}
                onClick={() => rank(opt.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 group-hover:border-indigo-400 flex items-center justify-center text-xs text-gray-400 group-hover:text-indigo-400">+</div>
                <span className="font-medium text-gray-700 text-sm">{opt.name}</span>
                {opt.description && <span className="text-xs text-gray-400 ml-auto">{opt.description}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalQuestion({ question, answer, onChange }) {
  const approved = answer?.approvedIds || [];
  const max = question.max_choices || question.options.length;

  const toggle = (id) => {
    if (approved.includes(id)) {
      onChange({ approvedIds: approved.filter(x => x !== id) });
    } else if (approved.length < max) {
      onChange({ approvedIds: [...approved, id] });
    }
  };

  return (
    <div className="space-y-2">
      {max < question.options.length && (
        <p className="text-xs text-gray-500 mb-3">Select up to {max}</p>
      )}
      {question.options.map(opt => {
        const isChecked = approved.includes(opt.id);
        const isDisabled = !isChecked && approved.length >= max;
        return (
          <label
            key={opt.id}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all
              ${isChecked ? 'border-green-500 bg-green-50' : isDisabled ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggle(opt.id)}
              disabled={isDisabled}
              className="accent-green-500 w-4 h-4"
            />
            <div>
              <p className="font-medium text-gray-900 text-sm">{opt.name}</p>
              {opt.description && <p className="text-xs text-gray-400">{opt.description}</p>}
            </div>
          </label>
        );
      })}
    </div>
  );
}

export const METHOD_INSTRUCTIONS = {
  plurality: 'Select one option.',
  irv: 'Click options to rank them in order of preference (1st choice first).',
  condorcet: 'Click options to rank them from most to least preferred.',
  approval: 'Select all options you approve of.',
};

export default function BallotPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [election, setElection] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [voter, setVoter] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [answers, setAnswers] = useState({}); // { [questionId]: choiceObject }
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    api.get(`/vote/${token}`)
      .then(res => {
        setElection(res.data.election);
        setQuestions(res.data.questions);
        setVoter(res.data.voter);
        setState('ready');
      })
      .catch(err => {
        const msg = getApiError(err, 'Invalid voting link');
        const alreadyVoted = err.response?.data?.alreadyVoted;
        if (alreadyVoted) setState('voted');
        else if (err.response?.status === 403) { setState('closed'); setErrorMsg(msg); }
        else { setState('error'); setErrorMsg(msg); }
      });
  }, [token]);

  const setAnswer = (questionId, choice) => {
    setAnswers(a => ({ ...a, [questionId]: choice }));
  };

  const validate = () => {
    for (const q of questions) {
      const ans = answers[q.id];
      if (q.method === 'plurality' && !ans?.candidateId) {
        return `Please make a selection for "${q.title}"`;
      }
      if ((q.method === 'irv' || q.method === 'condorcet') && (!ans?.rankings || ans.rankings.length === 0)) {
        return `Please rank at least one option for "${q.title}"`;
      }
      if (q.method === 'approval' && (!ans?.approvedIds || ans.approvedIds.length === 0)) {
        return `Please select at least one option for "${q.title}"`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { alert(err); return; }

    const answerPayload = questions.map(q => ({
      questionId: q.id,
      ...answers[q.id],
    }));

    setSubmitting(true);
    try {
      const res = await api.post(`/vote/${token}`, { answers: answerPayload });
      setSuccessMsg(res.data.message);
      setState('voted');
    } catch (err) {
      alert(getApiError(err, 'Failed to submit vote'));
      setSubmitting(false);
    }
  };

  const primaryColor = election?.primary_color || '#6366f1';

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
          <p className="text-xs text-gray-400 mt-4">Powered by VoTally</p>
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
      <div className="h-1.5" style={{ backgroundColor: primaryColor }} />

      <div className="max-w-lg mx-auto px-4 py-10 animate-slide-up">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{election.title}</h1>
          {election.description && (
            <p className="text-gray-500 text-sm leading-relaxed">{election.description}</p>
          )}
          {voter?.name && (
            <p className="text-xs text-gray-400 mt-3">Voting as <strong>{voter.name}</strong></p>
          )}
        </div>

        {/* Questions */}
        <div className="space-y-8">
          {questions.map((q, qi) => (
            <div key={q.id}>
              {/* Question header */}
              <div className="mb-4">
                <div className="flex items-start gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {qi + 1}
                  </span>
                  <div>
                    <h2 className="font-semibold text-gray-900">{q.title}</h2>
                    {q.description && <p className="text-sm text-gray-500 mt-0.5">{q.description}</p>}
                  </div>
                </div>
                <div className="mt-3 ml-10 p-2.5 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                  {METHOD_INSTRUCTIONS[q.method]}
                </div>
              </div>

              {/* Voting UI per method */}
              <div className="ml-10">
                {q.method === 'plurality' && (
                  <PluralityQuestion
                    question={q}
                    answer={answers[q.id]}
                    onChange={choice => setAnswer(q.id, choice)}
                  />
                )}
                {(q.method === 'irv' || q.method === 'condorcet') && (
                  <RankedQuestion
                    question={q}
                    answer={answers[q.id]}
                    onChange={choice => setAnswer(q.id, choice)}
                  />
                )}
                {q.method === 'approval' && (
                  <ApprovalQuestion
                    question={q}
                    answer={answers[q.id]}
                    onChange={choice => setAnswer(q.id, choice)}
                  />
                )}
              </div>

              {qi < questions.length - 1 && <hr className="mt-8 border-gray-200" />}
            </div>
          ))}
        </div>

        {/* Submit */}
        <div className="mt-10">
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

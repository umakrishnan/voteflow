import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

const METHOD_LABEL = {
  plurality: 'Plurality',
  irv: 'Ranked Choice (IRV)',
  approval: 'Approval Voting',
  condorcet: 'Condorcet',
};

function QuestionResults({ q, index }) {
  const maxBar = Math.max(
    ...(q.results || []).map(r => r.votes ?? r.copelandScore ?? 0),
    1
  );

  return (
    <div className="card p-5">
      {/* Question header */}
      <div className="flex items-start gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div>
          <h3 className="font-semibold text-gray-900">{q.title}</h3>
          {q.description && <p className="text-sm text-gray-500 mt-0.5">{q.description}</p>}
          <span className="inline-block text-xs text-gray-400 mt-1">{METHOD_LABEL[q.method] || q.method}</span>
        </div>
      </div>

      {/* Winner */}
      {q.winner && (
        <div className="mb-4 p-3 rounded-lg bg-brand-50 border border-brand-100 flex items-center gap-3">
          <span className="text-lg">🏆</span>
          <div>
            <p className="text-xs text-brand-500 font-medium uppercase tracking-wide">
              {q.condorcetWinnerFound === false ? 'Copeland winner' : 'Winner'}
            </p>
            <p className="font-semibold text-gray-900">{q.winner.name}</p>
          </div>
        </div>
      )}
      {q.tie && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
          ⚖️ Tied — no majority winner
        </div>
      )}

      {/* Results breakdown */}
      <div className="space-y-3">
        {(q.results || []).map((r, i) => {
          const barValue = q.method === 'condorcet'
            ? (r.wins / ((q.results.length - 1) || 1)) * 100
            : parseFloat(r.percentage || r.approvalRate || 0);

          const isWinner = q.winner?.id === r.id;

          return (
            <div key={r.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {isWinner && <span className="text-yellow-500 text-sm">🏆</span>}
                  <span className={`text-sm font-medium ${r.eliminated ? 'text-gray-400' : 'text-gray-900'}`}>{r.name}</span>
                  {r.eliminated && <span className="text-xs text-gray-400 italic">eliminated</span>}
                  {r.isCondorcetWinner && <span className="badge bg-green-100 text-green-700 text-xs">Condorcet winner</span>}
                </div>
                <span className="text-xs text-gray-500">
                  {q.method === 'condorcet'
                    ? `${r.wins}W / ${r.losses}L`
                    : q.method === 'approval'
                    ? `${r.votes} approvals (${r.approvalRate}%)`
                    : `${r.votes} votes (${r.percentage}%)`
                  }
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(barValue, barValue > 0 ? 2 : 0)}%`,
                    backgroundColor: isWinner ? '#6366f1' : '#d1d5db',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* IRV rounds */}
      {q.method === 'irv' && q.rounds?.length > 1 && (
        <details className="mt-5">
          <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
            Round-by-round breakdown
          </summary>
          <div className="mt-3 space-y-4">
            {q.rounds.map(round => (
              <div key={round.roundNumber}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Round {round.roundNumber}
                  {round.winner && <span className="ml-2 text-green-600">Majority winner</span>}
                </p>
                <div className="space-y-1.5">
                  {round.results.map(r => (
                    <div key={r.id} className={`flex items-center gap-2 text-sm ${r.eliminated ? 'opacity-40' : ''}`}>
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${r.eliminated ? 'bg-red-200' : 'bg-brand-200'}`} />
                      <span className="flex-1 text-gray-700">{r.name}</span>
                      <span className="text-gray-500 text-xs">{r.votes} ({r.percentage}%)</span>
                      {r.eliminated && <span className="text-xs text-red-400">eliminated</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const { slug } = useParams();
  const [results, setResults] = useState(null);
  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/elections/${slug}`),
      api.get(`/elections/${slug}/results`),
    ]).then(([elRes, resRes]) => {
      setElection(elRes.data.election);
      setResults(resRes.data);
    }).catch(() => setError('Failed to load results'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div></Layout>
  );
  if (error) return <Layout><div className="text-center py-20 text-red-600">{error}</div></Layout>;

  return (
    <Layout title={`Results: ${election?.title}`}>
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-6">
          <Link to={`/elections/${slug}`} className="text-sm text-gray-400 hover:text-gray-600">← Back to election</Link>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-6">{election?.title}</h1>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{results.ballotsCast}</p>
            <p className="text-xs text-gray-400 mt-0.5">Ballots cast</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{results.totalVoters}</p>
            <p className="text-xs text-gray-400 mt-0.5">Eligible voters</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{results.turnout}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Turnout</p>
          </div>
        </div>

        {/* Per-question results */}
        {results.ballotsCast === 0 ? (
          <div className="text-center py-12 text-gray-400">No votes have been cast yet.</div>
        ) : (
          <div className="space-y-6">
            {(results.questions || []).map((q, i) => (
              <QuestionResults key={q.id} q={q} index={i} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

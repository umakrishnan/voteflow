import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

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

  if (loading) return <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div></Layout>;
  if (error) return <Layout><div className="text-center py-20 text-red-600">{error}</div></Layout>;

  const maxVotes = Math.max(...(results.results || []).map(r => r.votes || r.copelandScore || 0), 1);

  return (
    <Layout title={`Results: ${election?.title}`}>
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-6">
          <Link to={`/elections/${slug}`} className="text-sm text-gray-400 hover:text-gray-600">← Back to election</Link>
        </div>

        {/* Summary cards */}
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

        {/* Winner banner */}
        {results.winner && (
          <div className="card p-6 mb-6 bg-gradient-to-r from-brand-500 to-brand-600 text-white border-0">
            <p className="text-xs font-medium text-brand-100 uppercase tracking-wider mb-1">
              {results.condorcetWinnerFound === false ? 'Copeland winner' : 'Winner'}
            </p>
            <h2 className="text-2xl font-bold">{results.winner.name}</h2>
            {results.winner.votes !== undefined && (
              <p className="text-brand-100 text-sm mt-1">
                {results.winner.votes} vote{results.winner.votes !== 1 ? 's' : ''}
                {results.winner.percentage ? ` · ${results.winner.percentage}%` : ''}
                {results.winner.approvalRate ? ` approval rate` : ''}
              </p>
            )}
          </div>
        )}

        {results.tie && (
          <div className="card p-5 mb-6 border-yellow-300 bg-yellow-50">
            <p className="font-semibold text-yellow-800">⚖️ Tied election</p>
            <p className="text-sm text-yellow-700 mt-1">No majority winner could be determined.</p>
          </div>
        )}

        {/* Results breakdown */}
        <div className="card p-5 mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {results.method === 'irv' ? 'Final round results' : 'Results'}
          </h3>
          <div className="space-y-3">
            {(results.results || []).map((r, i) => {
              const barValue = results.method === 'condorcet'
                ? (r.wins / ((results.results.length - 1) || 1)) * 100
                : parseFloat(r.percentage || r.approvalRate || 0);

              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {i === 0 && results.winner?.id === r.id && (
                        <span className="text-yellow-500">🏆</span>
                      )}
                      <span className="text-sm font-medium text-gray-900">{r.name}</span>
                      {r.eliminated && <span className="badge badge-draft text-xs">eliminated</span>}
                      {r.isCondorcetWinner && <span className="badge bg-green-100 text-green-700">Condorcet winner</span>}
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {results.method === 'condorcet'
                        ? `${r.wins}W / ${r.losses}L`
                        : `${r.votes ?? r.copelandScore} ${results.method === 'approval' ? `(${r.approvalRate}%)` : `(${r.percentage}%)`}`
                      }
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(barValue, barValue > 0 ? 2 : 0)}%`,
                        backgroundColor: i === 0 && results.winner?.id === r.id ? '#6366f1' : '#d1d5db',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* IRV rounds */}
        {results.method === 'irv' && results.rounds?.length > 1 && (
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Round-by-round breakdown</h3>
            <div className="space-y-5">
              {results.rounds.map(round => (
                <div key={round.roundNumber}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Round {round.roundNumber}
                    {round.winner && <span className="ml-2 text-green-600">✓ Majority winner</span>}
                    {round.tie && <span className="ml-2 text-yellow-600">Tie</span>}
                  </p>
                  <div className="space-y-1.5">
                    {round.results.map(r => (
                      <div key={r.id} className={`flex items-center gap-2 text-sm ${r.eliminated ? 'opacity-40' : ''}`}>
                        <span className={`w-4 h-4 rounded-full flex-shrink-0 ${r.eliminated ? 'bg-red-200' : 'bg-brand-100'}`} />
                        <span className="flex-1 text-gray-700">{r.name}</span>
                        <span className="text-gray-500 text-xs">{r.votes} ({r.percentage}%)</span>
                        {r.eliminated && <span className="text-xs text-red-400">eliminated</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

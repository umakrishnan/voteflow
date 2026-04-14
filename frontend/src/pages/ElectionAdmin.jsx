import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

const TABS = ['Candidates', 'Voters', 'Settings'];

export default function ElectionAdminPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Candidates');
  const [error, setError] = useState('');

  // Candidate form
  const [newCandidate, setNewCandidate] = useState({ name: '', description: '' });

  // Voter form
  const [voterInput, setVoterInput] = useState('');
  const [voterMsg, setVoterMsg] = useState('');

  const refresh = () => {
    api.get(`/elections/${slug}`)
      .then(res => setData(res.data))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [slug]);

  const addCandidate = async e => {
    e.preventDefault();
    if (!newCandidate.name.trim()) return;
    try {
      await api.post(`/elections/${slug}/candidates`, newCandidate);
      setNewCandidate({ name: '', description: '' });
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add candidate');
    }
  };

  const removeCandidate = async id => {
    if (!confirm('Remove this candidate?')) return;
    await api.delete(`/elections/${slug}/candidates/${id}`);
    refresh();
  };

  const addVoters = async e => {
    e.preventDefault();
    const lines = voterInput.split('\n').map(l => l.trim()).filter(Boolean);
    const voters = lines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      return { email: parts[0], name: parts[1] || null };
    }).filter(v => v.email);

    if (!voters.length) return;
    try {
      const res = await api.post(`/elections/${slug}/voters`, { voters });
      setVoterMsg(`✓ Added ${res.data.added} voter${res.data.added !== 1 ? 's' : ''}${res.data.skipped > 0 ? `, skipped ${res.data.skipped} duplicate${res.data.skipped !== 1 ? 's' : ''}` : ''}`);
      setVoterInput('');
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add voters');
    }
  };

  const removeVoter = async id => {
    await api.delete(`/elections/${slug}/voters/${id}`);
    refresh();
  };

  const updateStatus = async status => {
    try {
      await api.patch(`/elections/${slug}`, { status });
      refresh();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status');
    }
  };

  const copyVoteLink = voter => {
    const url = `${window.location.origin}/vote/${voter.token}`;
    navigator.clipboard.writeText(url);
  };

  if (loading) return (
    <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div></Layout>
  );
  if (error && !data) return <Layout><div className="text-center py-20 text-red-600">{error}</div></Layout>;

  const { election, candidates, voters } = data;
  const voteCount = voters.filter(v => v.voted_at).length;
  const turnout = voters.length > 0 ? Math.round((voteCount / voters.length) * 100) : 0;
  const voteLink = `${window.location.origin}/vote/`;

  const statusBadge = s => {
    const cls = { draft: 'badge-draft', open: 'badge-open', closed: 'badge-closed' };
    return <span className={cls[s] || 'badge-draft'}>{s}</span>;
  };

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 animate-fade-in">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{election.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            {statusBadge(election.status)}
            <span className="text-xs text-gray-400">{election.method}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {election.status === 'draft' && (
            <button onClick={() => updateStatus('open')} className="btn-primary">
              🚀 Open election
            </button>
          )}
          {election.status === 'open' && (
            <>
              <Link to={`/elections/${slug}/results`} className="btn-secondary">
                📊 Live results
              </Link>
              <button onClick={() => updateStatus('closed')} className="btn-danger">
                Close election
              </button>
            </>
          )}
          {election.status === 'closed' && (
            <Link to={`/elections/${slug}/results`} className="btn-primary">
              📊 View results
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Candidates', value: candidates.length },
          { label: 'Voters', value: voters.length },
          { label: 'Turnout', value: `${turnout}%` },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${tab === t
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Candidates Tab */}
      {tab === 'Candidates' && (
        <div className="animate-fade-in space-y-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No candidates yet.</p>
          ) : (
            <div className="space-y-2">
              {candidates.map((c, i) => (
                <div key={c.id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-semibold">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{c.name}</p>
                      {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                    </div>
                  </div>
                  {election.status === 'draft' && (
                    <button onClick={() => removeCandidate(c.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {election.status === 'draft' && (
            <form onSubmit={addCandidate} className="card p-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Add candidate</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input"
                  placeholder="Candidate name"
                  value={newCandidate.name}
                  onChange={e => setNewCandidate(c => ({ ...c, name: e.target.value }))}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Short bio (optional)"
                  value={newCandidate.description}
                  onChange={e => setNewCandidate(c => ({ ...c, description: e.target.value }))}
                />
                <button type="submit" className="btn-primary whitespace-nowrap">Add</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Voters Tab */}
      {tab === 'Voters' && (
        <div className="animate-fade-in space-y-4">
          {voterMsg && (
            <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200">{voterMsg}</div>
          )}

          {election.status === 'draft' && (
            <form onSubmit={addVoters} className="card p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Add voters</p>
              <p className="text-xs text-gray-400 mb-3">One per line: <code className="bg-gray-100 px-1 rounded">email@example.com</code> or <code className="bg-gray-100 px-1 rounded">email@example.com, Name</code></p>
              <textarea
                className="input mb-3"
                rows={4}
                placeholder={'alice@example.com, Alice\nbob@example.com, Bob\ncharlie@example.com'}
                value={voterInput}
                onChange={e => setVoterInput(e.target.value)}
              />
              <button type="submit" className="btn-primary">Add voters</button>
            </form>
          )}

          {voters.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No voters added yet.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {voters.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700">{v.email}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{v.name || '—'}</td>
                      <td className="px-4 py-3">
                        {v.voted_at
                          ? <span className="badge bg-green-100 text-green-700">✓ Voted</span>
                          : <span className="badge badge-draft">Pending</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {v.token && (
                            <button
                              onClick={() => copyVoteLink(v)}
                              className="text-xs text-brand-500 hover:text-brand-700"
                              title="Copy voting link"
                            >
                              Copy link
                            </button>
                          )}
                          {election.status === 'draft' && (
                            <button onClick={() => removeVoter(v.id)} className="text-gray-300 hover:text-red-400 transition-colors p-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {tab === 'Settings' && (
        <div className="animate-fade-in card p-5 max-w-md">
          <p className="text-sm text-gray-500 mb-1">Election slug</p>
          <code className="text-xs bg-gray-100 px-2 py-1 rounded">{election.slug}</code>
          <p className="text-sm text-gray-500 mt-4 mb-1">Voting method</p>
          <p className="text-sm font-medium">{election.method}</p>
          <p className="text-sm text-gray-500 mt-4 mb-1">Status</p>
          <p className="text-sm font-medium">{election.status}</p>
        </div>
      )}
    </Layout>
  );
}

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import api from '../api';
import { getApiError } from '../utils/apiError';
import { PluralityQuestion, RankedQuestion, ApprovalQuestion, METHOD_INSTRUCTIONS } from './Ballot';

const METHODS = [
  { id: 'plurality', label: 'Plurality', desc: 'Pick one winner' },
  { id: 'irv', label: 'Ranked Choice (IRV)', desc: 'Rank by preference' },
  { id: 'approval', label: 'Approval', desc: 'Select all you approve' },
  { id: 'condorcet', label: 'Condorcet', desc: 'Head-to-head matchups' },
];

const METHOD_BADGE = {
  plurality: 'bg-blue-100 text-blue-700',
  irv: 'bg-purple-100 text-purple-700',
  approval: 'bg-green-100 text-green-700',
  condorcet: 'bg-orange-100 text-orange-700',
};

const TABS = ['Questions', 'Voters', 'Preview', 'Settings'];

export default function ElectionAdminPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Questions');
  const [error, setError] = useState('');

  // Question state
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [newQuestion, setNewQuestion] = useState({ title: '', description: '', method: 'plurality', max_choices: 1 });
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newOption, setNewOption] = useState({ name: '', description: '' });
  const [addingOptionTo, setAddingOptionTo] = useState(null);

  // Voter state
  const [voterInput, setVoterInput] = useState('');
  const [voterMsg, setVoterMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [csvError, setCsvError] = useState('');

  // Email template state
  const [showEmailTemplate, setShowEmailTemplate] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState({ email_subject: '', email_body: '' });

  const refresh = () => {
    api.get(`/elections/${slug}`)
      .then(res => {
        setData(res.data);
        setEmailTemplate({
          email_subject: res.data.election.email_subject || '',
          email_body: res.data.election.email_body || '',
        });
      })
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [slug]);

  // ── Questions ─────────────────────────────────────────────────────────────

  const addQuestion = async e => {
    e.preventDefault();
    if (!newQuestion.title.trim()) return;
    try {
      const res = await api.post(`/elections/${slug}/questions`, newQuestion);
      setNewQuestion({ title: '', description: '', method: 'plurality', max_choices: 1 });
      setShowAddQuestion(false);
      setExpandedQuestion(res.data.question.id);
      setAddingOptionTo(res.data.question.id);
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to add question'));
    }
  };

  const deleteQuestion = async id => {
    if (!confirm('Delete this question and all its options?')) return;
    try {
      await api.delete(`/elections/${slug}/questions/${id}`);
      if (expandedQuestion === id) setExpandedQuestion(null);
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to delete question'));
    }
  };

  const addOption = async (questionId, e) => {
    e.preventDefault();
    if (!newOption.name.trim()) return;
    try {
      await api.post(`/elections/${slug}/questions/${questionId}/options`, newOption);
      setNewOption({ name: '', description: '' });
      setAddingOptionTo(null);
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to add option'));
    }
  };

  const deleteOption = async (questionId, optionId) => {
    try {
      await api.delete(`/elections/${slug}/questions/${questionId}/options/${optionId}`);
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to delete option'));
    }
  };

  // ── Voters ────────────────────────────────────────────────────────────────

  const handleCsvUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvError('');
    const reader = new FileReader();
    reader.onload = evt => {
      const lines = evt.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      // Skip header row if it looks like a header (first cell is "email" or "name")
      const firstCell = lines[0]?.split(',')[0]?.trim().toLowerCase();
      const rows = (firstCell === 'email' || firstCell === 'name') ? lines.slice(1) : lines;
      if (!rows.length) { setCsvError('No voter rows found in CSV.'); return; }
      const parsed = rows.map(row => {
        const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        return cols.filter(Boolean).join(', ');
      }).filter(Boolean);
      setVoterInput(prev => prev ? prev + '\n' + parsed.join('\n') : parsed.join('\n'));
      setCsvError('');
    };
    reader.onerror = () => setCsvError('Failed to read file.');
    reader.readAsText(file);
    e.target.value = '';
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
      setVoterMsg(`Added ${res.data.added} voter${res.data.added !== 1 ? 's' : ''}${res.data.skipped > 0 ? `, skipped ${res.data.skipped} duplicate${res.data.skipped !== 1 ? 's' : ''}` : ''}`);
      setVoterInput('');
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to add voters'));
    }
  };

  const removeVoter = async id => {
    await api.delete(`/elections/${slug}/voters/${id}`);
    refresh();
  };

  const sendEmails = async (voterIds) => {
    setSending(true);
    setVoterMsg('');
    try {
      const payload = voterIds ? { voterIds } : {};
      const res = await api.post(`/elections/${slug}/voters/send-emails`, payload);
      setVoterMsg(`Sent ${res.data.sent} email${res.data.sent !== 1 ? 's' : ''}${res.data.failed > 0 ? ` · ${res.data.failed} failed` : ''}`);
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to send emails'));
    } finally {
      setSending(false);
    }
  };

  const saveEmailTemplate = async () => {
    try {
      await api.patch(`/elections/${slug}`, emailTemplate);
      setShowEmailTemplate(false);
    } catch (err) {
      setError('Failed to save email template');
    }
  };

  const copyVoteLink = voter => {
    navigator.clipboard.writeText(`${window.location.origin}/vote/${voter.token}`);
  };

  const updateStatus = async status => {
    try {
      await api.patch(`/elections/${slug}`, { status });
      refresh();
    } catch (err) {
      setError(getApiError(err, 'Failed to update status'));
    }
  };

  if (loading) return (
    <Layout><div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div></Layout>
  );
  if (error && !data) return <Layout><div className="text-center py-20 text-red-600">{error}</div></Layout>;

  const { election, questions = [], voters = [] } = data;
  const voteCount = voters.filter(v => v.voted_at).length;
  const turnout = voters.length > 0 ? Math.round((voteCount / voters.length) * 100) : 0;


  const isDraft = election.status === 'draft';
  const unvotedVoters = voters.filter(v => !v.voted_at);

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 animate-fade-in">
        <div>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{election.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <StatusBadge status={election.status} />
            <span className="text-xs text-gray-400">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
            {isDraft && <span className="text-xs text-green-500 flex items-center gap-1">✓ Autosaved</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <button onClick={() => updateStatus('open')} className="btn-primary">
              Open election
            </button>
          )}
          {election.status === 'open' && (
            <>
              <Link to={`/elections/${slug}/results`} className="btn-secondary">Live results</Link>
              <button onClick={() => updateStatus('closed')} className="btn-danger">Close election</button>
            </>
          )}
          {election.status === 'closed' && (
            <Link to={`/elections/${slug}/results`} className="btn-primary">View results</Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Questions', value: questions.length },
          { label: 'Voters', value: voters.length },
          { label: 'Turnout', value: `${turnout}%` },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold" style={{ color: election.primary_color || '#6366f1' }}>{s.value}</p>
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
                ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── QUESTIONS TAB ── */}
      {tab === 'Questions' && (
        <div className="animate-fade-in space-y-4">
          {questions.length === 0 && !showAddQuestion && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-1">No questions yet</p>
              <p className="text-sm">Add your first question below</p>
            </div>
          )}

          {questions.map((q, qi) => (
            <div key={q.id} className="card overflow-hidden">
              {/* Question header */}
              <div
                className="p-4 flex items-start justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5">
                    {qi + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{q.title}</p>
                    {q.description && <p className="text-xs text-gray-400 mt-0.5">{q.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_BADGE[q.method]}`}>
                        {METHODS.find(m => m.id === q.method)?.label || q.method}
                      </span>
                      <span className="text-xs text-gray-400">{q.options.length} option{q.options.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {isDraft && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteQuestion(q.id); }}
                      className="text-gray-300 hover:text-red-400 transition-colors p-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${expandedQuestion === q.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded: options */}
              {expandedQuestion === q.id && (
                <div className="border-t border-gray-100 p-4 space-y-2 bg-gray-50">
                  {q.options.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No options yet. Add some below.</p>
                  )}
                  {q.options.map((opt, oi) => (
                    <div key={opt.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-xs font-medium text-gray-400 w-5">{oi + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{opt.name}</p>
                        {opt.description && <p className="text-xs text-gray-400">{opt.description}</p>}
                      </div>
                      {isDraft && (
                        <button
                          onClick={() => deleteOption(q.id, opt.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors p-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}

                  {isDraft && addingOptionTo === q.id ? (
                    <form onSubmit={e => addOption(q.id, e)} className="flex gap-2 mt-2">
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Option name"
                        value={newOption.name}
                        onChange={e => setNewOption(o => ({ ...o, name: e.target.value }))}
                        autoFocus
                      />
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Description (optional)"
                        value={newOption.description}
                        onChange={e => setNewOption(o => ({ ...o, description: e.target.value }))}
                      />
                      <button type="submit" className="btn-primary whitespace-nowrap text-sm">Add</button>
                      <button type="button" onClick={() => setAddingOptionTo(null)} className="btn-secondary text-sm">Cancel</button>
                    </form>
                  ) : isDraft && (
                    <button
                      onClick={() => { setAddingOptionTo(q.id); setNewOption({ name: '', description: '' }); }}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium mt-1"
                    >
                      + Add option
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add question */}
          {isDraft && (
            showAddQuestion ? (
              <form onSubmit={addQuestion} className="card p-5 space-y-4">
                <p className="text-sm font-medium text-gray-700">New question</p>
                <div>
                  <label className="label">Question title *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Who should be President?"
                    value={newQuestion.title}
                    onChange={e => setNewQuestion(q => ({ ...q, title: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Additional context for voters"
                    value={newQuestion.description}
                    onChange={e => setNewQuestion(q => ({ ...q, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Voting method</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {METHODS.map(m => (
                      <label
                        key={m.id}
                        className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all
                          ${newQuestion.method === m.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <input
                          type="radio"
                          name="method"
                          value={m.id}
                          checked={newQuestion.method === m.id}
                          onChange={() => setNewQuestion(q => ({ ...q, method: m.id }))}
                          className="mt-0.5 accent-brand-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{m.label}</p>
                          <p className="text-xs text-gray-500">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                {newQuestion.method === 'approval' && (
                  <div>
                    <label className="label">Max selections allowed</label>
                    <input
                      type="number"
                      className="input w-24"
                      min={1}
                      value={newQuestion.max_choices}
                      onChange={e => setNewQuestion(q => ({ ...q, max_choices: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn-primary">Add question</button>
                  <button type="button" onClick={() => setShowAddQuestion(false)} className="btn-secondary">Cancel</button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddQuestion(true)}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                + Add question
              </button>
            )
          )}
        </div>
      )}

      {/* ── VOTERS TAB ── */}
      {tab === 'Voters' && (
        <div className="animate-fade-in space-y-4">
          {voterMsg && (
            <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200">{voterMsg}</div>
          )}

          {/* Add voters */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-700">Add voters</p>
              <label className="btn-secondary text-xs cursor-pointer">
                Upload CSV
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleCsvUpload} />
              </label>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              CSV columns: <code className="bg-gray-100 px-1 rounded">email, name</code> — or paste one per line below
            </p>
            {csvError && (
              <div className="mb-3 p-2 rounded-lg bg-red-50 text-red-600 text-xs border border-red-200">{csvError}</div>
            )}
            <form onSubmit={addVoters}>
              <textarea
                className="input mb-3"
                rows={4}
                placeholder={'alice@example.com, Alice\nbob@example.com, Bob\ncharlie@example.com'}
                value={voterInput}
                onChange={e => setVoterInput(e.target.value)}
              />
              <button type="submit" className="btn-primary">Add voters</button>
            </form>
          </div>

          {/* Email template */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Email invite template</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Use <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{{election_title}}'}</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">{'{{link}}'}</code>
                </p>
              </div>
              <button
                onClick={() => setShowEmailTemplate(!showEmailTemplate)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                {showEmailTemplate ? 'Collapse' : 'Customize'}
              </button>
            </div>
            {showEmailTemplate && (
              <div className="space-y-3">
                <div>
                  <label className="label">Subject</label>
                  <input
                    type="text"
                    className="input"
                    value={emailTemplate.email_subject}
                    onChange={e => setEmailTemplate(t => ({ ...t, email_subject: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Body</label>
                  <textarea
                    className="input font-mono text-xs"
                    rows={8}
                    value={emailTemplate.email_body}
                    onChange={e => setEmailTemplate(t => ({ ...t, email_body: e.target.value }))}
                  />
                </div>
                <button onClick={saveEmailTemplate} className="btn-primary">Save template</button>
              </div>
            )}
          </div>

          {/* Send emails button */}
          {election.status !== 'draft' && voters.length > 0 && (
            <div className="flex items-center justify-between card p-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Send invite emails</p>
                <p className="text-xs text-gray-400 mt-0.5">{unvotedVoters.length} voter{unvotedVoters.length !== 1 ? 's' : ''} haven't voted yet</p>
              </div>
              <button
                onClick={() => sendEmails()}
                disabled={sending || unvotedVoters.length === 0}
                className="btn-primary disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send invites'}
              </button>
            </div>
          )}

          {election.status === 'draft' && voters.length > 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Open the election to send invite emails</p>
          )}

          {/* Voter table */}
          {voters.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No voters added yet.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Vote</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Email</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {voters.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700 text-sm">{v.email}</td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden sm:table-cell">{v.name || '—'}</td>
                      <td className="px-4 py-3">
                        {v.voted_at
                          ? <span className="badge bg-green-100 text-green-700">Voted</span>
                          : <span className="badge badge-draft">Pending</span>
                        }
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {v.email_status === 'sent'
                          ? <span className="text-xs text-green-600">Sent</span>
                          : v.email_status === 'failed'
                          ? <span className="text-xs text-red-500">Failed</span>
                          : <span className="text-xs text-gray-400">Not sent</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          {v.token && (
                            <button onClick={() => copyVoteLink(v)} className="text-xs text-brand-500 hover:text-brand-700">
                              Copy link
                            </button>
                          )}
                          {election.status !== 'draft' && !v.voted_at && (
                            <button
                              onClick={() => sendEmails([v.id])}
                              disabled={sending}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Resend
                            </button>
                          )}
                          {isDraft && (
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

      {/* ── PREVIEW TAB ── */}
      {tab === 'Preview' && (
        <div className="animate-fade-in">
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm flex items-center gap-2">
            <span>👁</span> Preview only — voters see this after opening the election. Submit is disabled.
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-1">No questions yet</p>
              <p className="text-sm">Add questions in the Questions tab to preview the ballot.</p>
            </div>
          ) : (
            <div className="max-w-lg mx-auto bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
              <div className="h-1.5" style={{ backgroundColor: election.primary_color || '#6366f1' }} />
              <div className="p-6">
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">{election.title}</h1>
                  {election.description && <p className="text-gray-500 text-sm leading-relaxed">{election.description}</p>}
                  <p className="text-xs text-gray-400 mt-3">Voting as <strong>Voter Name</strong></p>
                </div>

                <div className="space-y-8">
                  {questions.map((q, qi) => (
                    <div key={q.id}>
                      <div className="mb-4">
                        <div className="flex items-start gap-3">
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: election.primary_color || '#6366f1' }}
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
                      <div className="ml-10">
                        {q.method === 'plurality' && <PluralityQuestion question={q} answer={{}} onChange={() => {}} />}
                        {(q.method === 'irv' || q.method === 'condorcet') && <RankedQuestion question={q} answer={{}} onChange={() => {}} />}
                        {q.method === 'approval' && <ApprovalQuestion question={q} answer={{}} onChange={() => {}} />}
                      </div>
                      {qi < questions.length - 1 && <hr className="mt-8 border-gray-200" />}
                    </div>
                  ))}
                </div>

                <div className="mt-10">
                  <button
                    disabled
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm opacity-40 cursor-not-allowed"
                    style={{ backgroundColor: election.primary_color || '#6366f1' }}
                  >
                    Cast my vote → (disabled in preview)
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-3">
                    Your vote is anonymous and cannot be changed after submission.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === 'Settings' && (
        <div className="animate-fade-in card p-5 max-w-md space-y-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Election slug</p>
            <code className="text-sm bg-gray-100 px-2 py-1 rounded">{election.slug}</code>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Status</p>
            <p className="text-sm font-medium capitalize">{election.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Questions</p>
            <ul className="space-y-1">
              {questions.map((q, i) => (
                <li key={q.id} className="text-sm text-gray-700">
                  {i + 1}. {q.title} <span className={`text-xs px-1.5 py-0.5 rounded ${METHOD_BADGE[q.method]}`}>{q.method}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Layout>
  );
}

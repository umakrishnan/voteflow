import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

const METHODS = [
  {
    id: 'plurality',
    label: 'Plurality (First Past the Post)',
    desc: 'Each voter picks one candidate. Most votes wins. Simple and familiar.',
    icon: '☑️',
  },
  {
    id: 'irv',
    label: 'Ranked Choice (IRV)',
    desc: 'Voters rank candidates by preference. Ensures a majority winner.',
    icon: '🥇',
  },
  {
    id: 'approval',
    label: 'Approval Voting',
    desc: 'Voters approve any number of candidates. Best for finding consensus.',
    icon: '✅',
  },
  {
    id: 'condorcet',
    label: 'Condorcet',
    desc: 'The candidate who would beat everyone else head-to-head wins.',
    icon: '⚖️',
  },
];

export default function CreateElectionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    title: '',
    description: '',
    method: 'plurality',
    primary_color: '#6366f1',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Please enter an election title'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/elections', form);
      navigate(`/elections/${res.data.election.slug}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create election');
      setLoading(false);
    }
  };

  return (
    <Layout title="New Election">
      <div className="max-w-xl mx-auto animate-slide-up">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${step >= s ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {s}
              </div>
              <span className={`text-sm ${step === s ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {s === 1 ? 'Basic info' : 'Voting method'}
              </span>
              {s < 2 && <div className={`w-8 h-0.5 ${step > s ? 'bg-brand-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
        )}

        {step === 1 && (
          <div className="card p-6 space-y-5">
            <div>
              <label className="label">Election title *</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Student Council President 2024"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                className="input"
                rows={3}
                placeholder="Provide context for your voters…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Brand color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-1"
                  value={form.primary_color}
                  onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                />
                <span className="text-sm text-gray-500">Shown on your voter ballot page</span>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  if (!form.title.trim()) { setError('Please enter an election title'); return; }
                  setError('');
                  setStep(2);
                }}
                className="btn-primary"
              >
                Next: Choose voting method →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card p-6">
            <p className="text-sm text-gray-500 mb-4">How should votes be counted?</p>
            <div className="space-y-3 mb-6">
              {METHODS.map(m => (
                <label
                  key={m.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                    ${form.method === m.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m.id}
                    checked={form.method === m.id}
                    onChange={() => setForm(f => ({ ...f, method: m.id }))}
                    className="mt-1 accent-brand-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{m.icon}</span>
                      <span className="font-medium text-gray-900 text-sm">{m.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => setStep(1)} className="btn-secondary">← Back</button>
              <button onClick={handleCreate} className="btn-primary" disabled={loading}>
                {loading ? 'Creating…' : 'Create election →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

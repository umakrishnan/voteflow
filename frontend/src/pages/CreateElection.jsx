import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

export default function CreateElectionPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
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
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Create a new election</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
        )}

        <div className="card p-6 space-y-5">
          <div>
            <label className="label">Election title *</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Student Council President 2025"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
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
              <span className="text-sm text-gray-500">Shown on ballot pages</span>
            </div>
          </div>
          <div className="pt-2">
            <p className="text-xs text-gray-400 mb-4">
              After creating, you'll add questions and voters in the admin panel.
            </p>
            <button onClick={handleCreate} className="btn-primary w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create election →'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

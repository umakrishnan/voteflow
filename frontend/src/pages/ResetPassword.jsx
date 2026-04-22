import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { getApiError } from '../utils/apiError';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login?reset=1');
    } catch (err) {
      setError(getApiError(err, 'This link is invalid or has expired.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-lg">Vo<span className="text-brand-500">Tally</span></span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
          <p className="text-gray-500 text-sm mt-1">Choose something strong</p>
        </div>

        <div className="card p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">New password</label>
              <input
                type="password"
                className="input"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label">Confirm password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full btn-lg" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          <Link to="/login" className="text-brand-600 font-medium hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

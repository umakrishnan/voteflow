import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { getApiError } from '../utils/apiError';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err) {
      setError(getApiError(err, 'Something went wrong. Please try again.'));
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
          <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
          <p className="text-gray-500 text-sm mt-1">We'll send a reset link to your email</p>
        </div>

        <div className="card p-6">
          {submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium mb-1">Check your inbox</p>
              <p className="text-sm text-gray-500">If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn-primary w-full btn-lg" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          <Link to="/login" className="text-brand-600 font-medium hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

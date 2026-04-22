import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../api';

export default function DashboardPage() {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/elections')
      .then(res => setElections(res.data.elections))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const statusBadge = status => {
    const cls = { draft: 'badge-draft', open: 'badge-open', closed: 'badge-closed' };
    return <span className={cls[status] || 'badge-draft'}>{status}</span>;
  };

  return (
    <Layout title="My Elections">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {elections.length === 0 ? 'No elections yet' : `${elections.length} election${elections.length !== 1 ? 's' : ''}`}
        </p>
        <Link to="/elections/new" className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New election
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : elections.length === 0 ? (
        <div className="card p-12 text-center animate-fade-in">
          <div className="text-4xl mb-4">🗳️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Create your first election</h2>
          <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
            Set up candidates, invite voters by email, and get results in minutes.
          </p>
          <Link to="/elections/new" className="btn-primary btn-lg">
            Create election →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 animate-fade-in">
          {elections.map(e => (
            <Link
              key={e.id}
              to={`/elections/${e.slug}`}
              className="card p-5 flex items-center justify-between hover:shadow-md transition-shadow group block"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {statusBadge(e.status)}
                  <span className="text-xs text-gray-400">{e.question_count} question{e.question_count !== '1' ? 's' : ''}</span>
                </div>
                <h3 className="font-medium text-gray-900 truncate group-hover:text-brand-600 transition-colors">
                  {e.title}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {e.candidate_count} candidate{e.candidate_count !== 1 ? 's' : ''} ·{' '}
                  {e.vote_count}/{e.voter_count} voted
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-300 group-hover:text-brand-400 transition-colors flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Layout({ children, title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900">VoTally</span>
          </Link>

          <nav className="flex items-center gap-2">
            {user ? (
              <>
                <span className="text-sm text-gray-500 hidden sm:block">{user.name}</span>
                <Link to="/dashboard" className="btn-secondary btn-sm">Dashboard</Link>
                <button onClick={handleLogout} className="btn-secondary btn-sm">Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary btn-sm">Log in</Link>
                <Link to="/register" className="btn-primary btn-sm">Get started free</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {title && (
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            </div>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} VoTally. Free forever.</p>
          <p className="text-xs text-gray-400">Secure • Private • Open</p>
        </div>
      </footer>
    </div>
  );
}

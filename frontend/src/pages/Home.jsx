import { Link } from 'react-router-dom';
import Layout from '../components/Layout';

const features = [
  {
    icon: '🗳️',
    title: 'Multiple voting methods',
    desc: 'Plurality, ranked-choice (IRV), approval voting, and Condorcet — all supported.',
  },
  {
    icon: '🔒',
    title: 'Secure single-use links',
    desc: 'Every voter gets a unique, tamper-proof link. One person, one vote.',
  },
  {
    icon: '📊',
    title: 'Transparent results',
    desc: 'Step-by-step count breakdowns and live turnout tracking.',
  },
  {
    icon: '🎨',
    title: 'Beautiful ballots',
    desc: 'Modern, mobile-first design. Customize colors and branding.',
  },
  {
    icon: '🆓',
    title: 'Free during beta',
    desc: 'No credit card needed while we\'re in beta. Enjoy full access at no cost — for now.',
  },
  {
    icon: '⚡',
    title: 'Up in minutes',
    desc: 'Guided setup wizard. Add questions, paste voter emails, go.',
  },
];

export default function HomePage() {
  return (
    <Layout>
      {/* Hero */}
      <section className="text-center py-16 sm:py-24 animate-fade-in">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-600 text-xs font-medium px-3 py-1 rounded-full mb-6">
          <span>✨</span> Simple, fair, and in beta
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-5">
          Run elections, <span className="text-brand-500">totally</span> right.<br />Your <span className="text-brand-500">vote's</span> best <span className="text-brand-500">ally</span> for every <span className="text-brand-500">tally</span>.
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
          VoTally makes it easy to run secure, transparent elections for any organization —
          with beautiful ballots, instant results, and voter emails built in.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/register" className="btn-primary btn-lg w-full sm:w-auto">
            Create your first election →
          </Link>
          <Link to="/login" className="btn-secondary btn-lg w-full sm:w-auto">
            Log in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div key={f.title} className="card p-5 hover:shadow-md transition-shadow">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-12">
        <div className="card p-10 bg-brand-500 border-0 text-white">
          <h2 className="text-2xl font-bold mb-3">Ready to run a better election?</h2>
          <p className="text-brand-100 mb-6">Free during beta — full access, no credit card required.</p>
          <Link to="/register" className="inline-flex btn bg-white text-brand-600 hover:bg-brand-50 btn-lg font-semibold">
            Get started
          </Link>
        </div>
      </section>
    </Layout>
  );
}

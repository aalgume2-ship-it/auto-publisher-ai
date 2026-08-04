import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="glass-card" style={{ width: 'min(640px, 100%)', padding: 40, textAlign: 'center' }}>
        <span className="eyebrow">404 • Lost in the Studio</span>
        <h1 style={{ fontSize: 'clamp(48px, 9vw, 88px)', margin: '16px 0 8px' }}>Page not found</h1>
        <p style={{ color: 'var(--text-soft)', maxWidth: 480, margin: '0 auto 24px' }}>
          The page you are looking for is not available in this workspace route map. Return to the premium studio home and continue from there.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" href="/">Go Home</Link>
          <Link className="btn btn-ghost" href="/dashboard/">Open Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

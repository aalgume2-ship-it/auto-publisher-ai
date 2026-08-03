import Link from 'next/link';

/** Static-export friendly 404 (server component only). */
export default function NotFound() {
  return (
    <div className="container auth-wrap" style={{ textAlign: 'center' }}>
      <div className="panel">
        <h1 style={{ fontSize: 40, marginBottom: 6 }}>404</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 18 }}>الصفحة غير موجودة.</p>
        <Link className="btn btn-primary" href="/">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import HealthChip from '../components/HealthChip';

export const metadata: Metadata = {
  title: 'AutoCreator AI — منصّة القنوات الذاتية بالذكاء الاصطناعي',
  description:
    'أنشئ وانشر مقاطع الفيديو القصيرة تلقائياً عبر قنواتك — منظمات وفِرق، مصادقة آمنة، وخطوط إنتاج بالذكاء الاصطناعي.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-header">
          <div className="container">
            <Link className="logo" href="/">
              <span className="mark">🎬</span>
              <span>AutoCreator AI</span>
            </Link>
            <nav className="nav">
              <a href="/#features">المزايا</a>
              <a href="/#pricing">الأسعار</a>
              <a href={process.env.NEXT_PUBLIC_API_BASE ? `${process.env.NEXT_PUBLIC_API_BASE}/docs` : 'https://autocreator-api-preview.onrender.com/docs'} target="_blank" rel="noreferrer">
                API
              </a>
              <HealthChip />
              <Link className="btn btn-ghost" href="/login/">
                دخول
              </Link>
              <Link className="btn btn-primary" href="/register/">
                ابدأ مجاناً
              </Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>© 2026 AutoCreator AI</span>
            <span className="spacer" />
            <a href="https://autocreator-api-preview.onrender.com/openapi.json" target="_blank" rel="noreferrer">
              OpenAPI
            </a>
            <a href="https://autocreator-api-preview.onrender.com/health" target="_blank" rel="noreferrer">
              حالة الخدمة
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}

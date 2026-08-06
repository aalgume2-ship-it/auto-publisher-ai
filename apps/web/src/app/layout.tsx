import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
import ErrorBoundary from '../components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'AutoCreator AI — Premium AI Studio',
  description: 'Premium AI-native studio for channels, assets, publishing and creative automation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&family=Noto+Kufi+Arabic:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}

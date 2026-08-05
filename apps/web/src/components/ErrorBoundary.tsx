'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component — catches React rendering errors and displays a
 * fallback UI instead of crashing the entire app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] React error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="auth-shell">
          <div className="glass-card" style={{ padding: 40, maxWidth: 600, textAlign: 'center' }}>
            <span className="eyebrow">خطأ غير متوقع</span>
            <h1 style={{ fontSize: 32, margin: '16px 0' }}>حدث خطأ في العرض</h1>
            <p style={{ color: 'var(--text-soft)', marginBottom: 24 }}>
              نعتذر عن هذا الخطأ. يرجى تحديث الصفحة أو العودة إلى لوحة التحكم الرئيسية.
            </p>
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                تحديث الصفحة
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => window.location.href = '/dashboard/'}
              >
                العودة للوحة التحكم
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={{ marginTop: 24, textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>تفاصيل الخطأ (للمطورين)</summary>
                <pre style={{ marginTop: 12, padding: 16, background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'auto', fontSize: 12, direction: 'ltr' }}>
                  {this.state.error.message}
                  {'\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

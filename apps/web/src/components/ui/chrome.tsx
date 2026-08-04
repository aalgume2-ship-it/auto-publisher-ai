import type { ReactNode } from 'react';

export function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`glass-card ${className}`.trim()}>{children}</section>;
}

export function SectionHeader({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="section-header-row">
      <div>
        {eyebrow && <p className="eyebrow subtle">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
        {body && <p className="section-copy">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state glass-card">
      <div className="empty-state-orb" />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="stat-tile glass-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

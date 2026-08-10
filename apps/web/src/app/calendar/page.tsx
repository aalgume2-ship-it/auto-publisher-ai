'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import StudioNav from '../../components/studio/StudioNav';

type Item = {
  id: string;
  title: string;
  status: 'scheduled' | 'published' | 'draft' | 'generating' | 'failed';
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  platform?: 'youtube' | 'tiktok' | 'instagram';
};

const STATUS_COLORS: Record<Item['status'], string> = {
  scheduled: 'rgba(212,255,50,0.18)',
  published: 'rgba(61,255,192,0.18)',
  draft: 'rgba(255,255,255,0.08)',
  generating: 'rgba(120,170,255,0.18)',
  failed: 'rgba(255,120,120,0.18)',
};

const STATUS_LABELS: Record<Item['status'], string> = {
  scheduled: 'Scheduled',
  published: 'Published',
  draft: 'Draft',
  generating: 'Generating',
  failed: 'Failed',
};

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [items, setItems] = useState<Item[]>([
    { id: 'i1', title: 'Product launch teaser', status: 'scheduled', date: fmt(anchor.getFullYear(), anchor.getMonth(), 12), time: '20:00', platform: 'youtube' },
    { id: 'i2', title: 'Weekly recap', status: 'published', date: fmt(anchor.getFullYear(), anchor.getMonth(), 8), time: '18:00', platform: 'tiktok' },
    { id: 'i3', title: 'Behind the scenes', status: 'draft', date: fmt(anchor.getFullYear(), anchor.getMonth(), 15), time: '10:30' },
  ]);

  const month = useMemo(() => {
    const first = startOfMonth(anchor);
    const firstWeekday = first.getDay(); // 0 = Sun
    const total = daysInMonth(anchor);
    const cells: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= total; d++) {
      cells.push({ date: fmt(anchor.getFullYear(), anchor.getMonth(), d), day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [anchor]);

  const monthLabel = anchor.toLocaleString('en', { month: 'long', year: 'numeric' });

  function move(delta: number) {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  function moveItem(id: string, targetDate: string) {
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, date: targetDate } : i)));
  }

  return (
    <div dir="ltr" className="studio-root">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="grain" />
      <StudioNav minimal />
      <main className="shell" style={{ paddingTop: 20 }}>
        <div className="row between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800 }}>Content Calendar</h1>
            <p className="muted">Plan, schedule, and review what's going out.</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-ghost" onClick={() => move(-1)}>
              <ChevronLeft size={16} />
            </button>
            <span className="chip" style={{ padding: '8px 14px' }}>
              <Calendar size={14} /> {monthLabel}
            </span>
            <button className="btn btn-ghost" onClick={() => move(1)}>
              <ChevronRight size={16} />
            </button>
            <button className="btn btn-primary" onClick={() => setAnchor(new Date())}>
              Today
            </button>
          </div>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
              marginBottom: 8,
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="sm muted" style={{ textAlign: 'center', fontWeight: 700 }}>
                {d}
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
            }}
          >
            {month.map((c, idx) => {
              const dayItems = c.date ? items.filter((i) => i.date === c.date) : [];
              return (
                <div
                  key={idx}
                  onDragOver={(e: React.DragEvent<HTMLDivElement>) => e.preventDefault()}
                  onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                    const id = e.dataTransfer.getData('text/plain');
                    if (id && c.date) moveItem(id, c.date);
                  }}
                  style={{
                    minHeight: 92,
                    background: c.date ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    padding: 8,
                    position: 'relative',
                  }}
                >
                  {c.date && (
                    <div className="sm muted" style={{ fontSize: 11, marginBottom: 4 }}>
                      {c.day}
                    </div>
                  )}
                  {dayItems.map((it) => (
                    <div
                      key={it.id}
                      draggable
                      onDragStart={(e: React.DragEvent<HTMLDivElement>) => e.dataTransfer.setData('text/plain', it.id)}
                      style={{
                        background: STATUS_COLORS[it.status],
                        borderRadius: 6,
                        padding: '4px 6px',
                        fontSize: 11,
                        marginBottom: 4,
                        cursor: 'grab',
                        lineHeight: 1.3,
                      }}
                      title={`${it.title} — ${STATUS_LABELS[it.status]} ${it.time}`}
                    >
                      <div style={{ fontWeight: 600 }}>{it.time}</div>
                      <div style={{ opacity: 0.85 }}>{it.title}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="glass"
          style={{
            marginTop: 14,
            padding: 14,
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--accent-strong)' }} />
          <div className="sm" style={{ flex: 1 }}>
            Drag items between days to reschedule. The auto-publisher queue reads from this calendar when the cron worker runs.
          </div>
          <button className="btn btn-primary" onClick={() => alert('Hook this up to the scheduling backend — POST /v1/schedules with payload { companyId, prompt, runAt, platforms }.')}>
            <Sparkles size={14} /> Schedule a render
          </button>
        </div>
      </main>
    </div>
  );
}

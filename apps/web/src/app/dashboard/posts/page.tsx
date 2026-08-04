'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ExternalLink, Radar } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
import { ApiProblem, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface PostItem {
  id: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  platformUrl: string | null;
  lastError: string | null;
  video: { id: string; title: string; durationMs: number | null };
  channel: { id: string; displayName: string; handle: string | null; avatarUrl: string | null };
}

export default function PostsPage() {
  const { session, ready } = useAuthenticatedSession();
  const [items, setItems] = useState<PostItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.orgId) return;
    try {
      const res = await api.get<{ items: PostItem[] }>(`/v1/organizations/${session.orgId}/posts`, session.accessToken);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل مهام النشر');
    }
  }, [session]);

  useEffect(() => {
    if (session?.orgId && !items) void load();
  }, [session, items, load]);

  async function cancel(taskId: string) {
    if (!session?.orgId) return;
    setBusy(taskId);
    try {
      await api.del(`/v1/organizations/${session.orgId}/posts/${taskId}`, session.accessToken);
      void load();
    } catch (e) {
      setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر الإلغاء');
    } finally {
      setBusy(null);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Publishing Queue" subtitle="A clean operations surface for scheduled jobs, publishing health and live outbound results.">
      {error && <div className="alert err">{error}</div>}
      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Outbound Status" title="Publishing tasks across your connected channels." body="Monitor scheduled uploads, live publishing state and failures from one refined operations board." />
          {items === null ? (
            <div className="section-grid three">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="glass-card skeleton" style={{ minHeight: 200 }} />)}</div>
          ) : items.length === 0 ? (
            <EmptyState title="No publishing tasks yet" body="Generate a video inside Studio, then schedule it onto a connected channel to start filling this queue." action={<Link className="btn btn-primary" href="/dashboard/series/">Open Studio</Link>} />
          ) : (
            <div className="media-grid">
              {items.map((post, index) => (
                <Reveal key={post.id} delay={index * 0.03}>
                  <HoverLift>
                    <div className="glass-card">
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p className="eyebrow subtle">{post.channel.displayName}</p>
                          <h3>{post.video.title}</h3>
                          <p>{post.video.durationMs ? `${Math.round(post.video.durationMs / 1000)}s video` : 'Short-form video'}</p>
                        </div>
                        <span className={`stat-chip ${post.status === 'PUBLISHED' ? 'stat-ready' : post.status === 'FAILED' ? 'stat-fail' : post.status === 'UPLOADING' ? 'stat-busy' : 'stat-plain'}`}>{post.status}</span>
                      </div>
                      <div className="row" style={{ marginTop: 14 }}>
                        <span className="stat-chip stat-plain"><CalendarClock size={14} /> {post.publishedAt ? new Date(post.publishedAt).toLocaleString('en-GB') : post.scheduledAt ? new Date(post.scheduledAt).toLocaleString('en-GB') : 'Immediate'}</span>
                        <span className="stat-chip stat-plain"><Radar size={14} /> Live queue visibility</span>
                      </div>
                      {post.lastError && <div className="alert err" style={{ marginTop: 16 }}>{post.lastError}</div>}
                      <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
                        {post.status === 'PUBLISHED' && post.platformUrl ? (
                          <a className="btn btn-primary" href={post.platformUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open Live</a>
                        ) : <span />}
                        {(post.status === 'SCHEDULED' || post.status === 'QUEUED') && (
                          <button className="btn btn-ghost" disabled={busy === post.id} onClick={() => void cancel(post.id)}>{busy === post.id ? 'Cancelling…' : 'Cancel task'}</button>
                        )}
                      </div>
                    </div>
                  </HoverLift>
                </Reveal>
              ))}
            </div>
          )}
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}

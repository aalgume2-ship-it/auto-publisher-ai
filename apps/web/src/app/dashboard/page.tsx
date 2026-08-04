'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Film, FolderKanban, RadioTower, Sparkles } from 'lucide-react';
import Link from 'next/link';
import AppShell from '../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader, StatTile } from '../../components/ui/chrome';
import { HoverLift, Reveal } from '../../components/ui/reveal';
import { ApiProblem, api, arabicMessage } from '../../lib/api';
import { clearSession, patchSession, readClaims } from '../../lib/session';
import { useAuthenticatedSession } from '../../lib/use-authenticated-session';

const TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+2)' },
  { value: 'Europe/London', label: 'لندن (GMT+0/+1)' },
  { value: 'UTC', label: 'التوقيت العالمي UTC' },
];

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  createdAt: string;
  counts: { members: number; teams: number; departments: number };
}
interface WorkspaceMembership {
  role: string;
  status: string;
  joinedAt: string;
  organization: OrgDetail;
}
interface Counts {
  channels: number;
  series: number;
  videos: number;
  posts: number;
  published: number;
  firstSeriesId: string | null;
}

export default function DashboardPage() {
  const { session, setSession, ready } = useAuthenticatedSession();
  const [workspaces, setWorkspaces] = useState<WorkspaceMembership[]>([]);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgTz, setNewOrgTz] = useState('Asia/Riyadh');

  const currentOrgId = session?.orgId ?? workspaces[0]?.organization.id ?? null;
  const claims = session?.accessToken ? readClaims(session.accessToken) : {};

  const loadWorkspaces = useCallback(async () => {
    if (!session?.accessToken) return;
    const res = await api.get<{ items: WorkspaceMembership[] }>('/v1/organizations', session.accessToken);
    setWorkspaces(res.items);
    if (!session.orgId && res.items[0]?.organization.id) {
      patchSession({ orgId: res.items[0].organization.id });
      setSession((cur) => (cur ? { ...cur, orgId: res.items[0]!.organization.id } : cur));
    }
  }, [session, setSession]);

  const loadOrg = useCallback(async (orgId: string) => {
    if (!session?.accessToken) return;
    setOrg(await api.get<OrgDetail>(`/v1/organizations/${orgId}`, session.accessToken));
  }, [session]);

  const loadCounts = useCallback(async (orgId: string) => {
    if (!session?.accessToken) return;
    const [c, s, v, p] = await Promise.all([
      api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/channels`, session.accessToken),
      api.get<{ items: { id: string }[] }>(`/v1/organizations/${orgId}/series`, session.accessToken),
      api.get<{ items: unknown[] }>(`/v1/organizations/${orgId}/videos`, session.accessToken),
      api.get<{ items: { status: string }[] }>(`/v1/organizations/${orgId}/posts`, session.accessToken),
    ]);
    setCounts({
      channels: c.items.length,
      series: s.items.length,
      videos: v.items.length,
      posts: p.items.length,
      published: p.items.filter((t) => t.status === 'PUBLISHED').length,
      firstSeriesId: s.items[0]?.id ?? null,
    });
  }, [session]);

  useEffect(() => {
    if (!ready || !session?.accessToken) return;
    void loadWorkspaces().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل مساحات العمل'));
  }, [ready, session, loadWorkspaces]);

  useEffect(() => {
    if (!session?.accessToken || !currentOrgId) return;
    void loadOrg(currentOrgId).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل المنظمة'));
    void loadCounts(currentOrgId).catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل الإحصاءات'));
  }, [session, currentOrgId, loadOrg, loadCounts]);

  const currentMembership = useMemo(() => workspaces.find((w) => w.organization.id === currentOrgId) ?? null, [workspaces, currentOrgId]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.accessToken) return;
    if (newOrgName.trim().length < 2) {
      setError('أدخل اسم مساحة العمل (حرفان على الأقل).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<OrgDetail>('/v1/organizations', { name: newOrgName.trim(), timezone: newOrgTz, defaultLocale: 'ar-SA' }, session.accessToken);
      patchSession({ orgId: created.id });
      setSession((cur) => (cur ? { ...cur, orgId: created.id } : cur));
      setNewOrgName('');
      await loadWorkspaces();
      setOrg(created);
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء مساحة العمل');
    } finally {
      setBusy(false);
    }
  }

  function switchWorkspace(orgId: string) {
    patchSession({ orgId });
    setSession((cur) => (cur ? { ...cur, orgId } : cur));
    setCounts(null);
    setOrg(null);
    setError(null);
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  if (!ready || !session) {
    return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;
  }

  return (
    <AppShell
      session={session}
      title={`Welcome back${session.displayName ? `, ${session.displayName}` : ''}`}
      subtitle="A premium control center for workspaces, assets, series and publishing operations."
      actions={<button className="btn btn-ghost" onClick={logout}>Logout</button>}
    >
      {error && <div className="alert err">{error}</div>}
      <Reveal>
        <div className="section-grid three">
          <StatTile label="Active Workspaces" value={workspaces.length} hint="Companies, brands and operator spaces." />
          <StatTile label="Published Videos" value={counts?.published ?? 0} hint="Live outputs shipped from the current workspace." />
          <StatTile label="Connected Channels" value={counts?.channels ?? 0} hint="Destinations ready for scheduling and publishing." />
        </div>
      </Reveal>

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Workspace Switcher" title="Choose your active workspace." body="Jump between organizations, monitor their state, and move instantly into the correct studio context." />
            {workspaces.length === 0 ? (
              <EmptyState title="No workspaces yet" body="Create the first workspace to unlock channels, assets, series and publishing workflows." />
            ) : (
              <div className="section-grid" style={{ gridTemplateColumns: '1fr' }}>
                {workspaces.map((item) => (
                  <HoverLift key={item.organization.id}>
                    <button className="glass-card" style={{ textAlign: 'right', width: '100%' }} onClick={() => switchWorkspace(item.organization.id)}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p className="eyebrow subtle">{item.role}</p>
                          <h3>{item.organization.name}</h3>
                          <p className="mono">{item.organization.slug}</p>
                        </div>
                        <span className={`stat-chip ${item.organization.id === currentOrgId ? 'stat-ready' : 'stat-plain'}`}>{item.organization.id === currentOrgId ? 'Current' : item.status}</span>
                      </div>
                      <div className="row" style={{ marginTop: 14 }}>
                        <span className="stat-chip stat-plain"><Building2 size={14} /> {item.organization.counts?.members ?? 0} members</span>
                        <span className="stat-chip stat-plain"><FolderKanban size={14} /> {item.organization.counts?.departments ?? 0} departments</span>
                        <span className="stat-chip stat-plain"><Film size={14} /> {item.organization.counts?.teams ?? 0} teams</span>
                      </div>
                    </button>
                  </HoverLift>
                ))}
              </div>
            )}
          </GlassCard>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Create Workspace" title="Spin up a new operator space." body="Each workspace isolates its channels, assets, series and publishing state while keeping the same premium studio experience." />
            <form onSubmit={createOrg}>
              <div className="field">
                <label htmlFor="orgname">Workspace name</label>
                <input id="orgname" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Noor Media Studio" />
              </div>
              <div className="field">
                <label htmlFor="orgtz">Timezone</label>
                <select id="orgtz" value={newOrgTz} onChange={(e) => setNewOrgTz(e.target.value)}>
                  {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Creating…' : 'Create Workspace'}</button>
            </form>
          </GlassCard>
        </Reveal>
      </div>

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Studio Summary" title={org ? org.name : 'Select a workspace'} body={org ? `Role: ${currentMembership?.role ?? '—'} • ${org.timezone}` : 'Choose a workspace to load its studio metrics and recent activity.'} />
            {org ? (
              <div className="section-grid two">
                <StatTile label="Series" value={counts?.series ?? 0} hint="Creative pipelines inside this workspace." />
                <StatTile label="Videos" value={counts?.videos ?? 0} hint="Generated or queued outputs." />
                <StatTile label="Posts" value={counts?.posts ?? 0} hint="Scheduled or published tasks." />
                <StatTile label="Language" value={org.defaultLocale} hint="Default locale for this operator space." />
              </div>
            ) : (
              <EmptyState title="Workspace not selected" body="Choose a workspace from the list to load the studio summary and actionable shortcuts." />
            )}
          </GlassCard>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Quick Actions" title="Jump into the parts operators use most." body="A redesigned command surface for studio work, asset intake, channel wiring and admin review." />
            <div className="section-grid two">
              <Link className="glass-card" href="/dashboard/series/"><h3>Studio</h3><p>Manage series, prompts and output flows.</p></Link>
              <Link className="glass-card" href="/dashboard/assets/"><h3>Assets</h3><p>Upload, tag and organize source material.</p></Link>
              <Link className="glass-card" href="/dashboard/channels/"><h3>Channels</h3><p>Wire distribution destinations and status.</p></Link>
              <Link className="glass-card" href="/dashboard/admin/"><h3>Admin</h3><p>Inspect workspace settings and operator state.</p></Link>
              <Link className="glass-card" href="/dashboard/billing/"><h3>Billing</h3><p>Review commercial layer and checkout flow.</p></Link>
              <Link className="glass-card" href={counts?.firstSeriesId ? `/dashboard/series/detail/?id=${counts.firstSeriesId}` : '/dashboard/series/'}><h3>Recent Project</h3><p>Continue the most recent content pipeline.</p></Link>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </AppShell>
  );
}

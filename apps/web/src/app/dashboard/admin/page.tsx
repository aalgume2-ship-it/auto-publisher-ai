'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, FolderCog, Settings2, ShieldCheck, SwatchBook, UsersRound } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader, StatTile } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
import { ApiProblem, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  defaultLocale: string;
  counts?: { members: number; teams: number; departments: number };
}

interface Settings {
  timezone: string;
  defaultLocale: string;
  securityPolicy: { enforceSso?: boolean; enforceMfa?: boolean; sessionMaxHours?: number; ipAllowListEnabled?: boolean };
}

interface Brand {
  brandName: string | null;
  primaryColor: string;
  hidePoweredBy: boolean;
}

export default function AdminPage() {
  const { session, ready } = useAuthenticatedSession();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ timezone: 'Asia/Riyadh', defaultLocale: 'ar-SA', enforceMfa: false, sessionMaxHours: 24 });

  const load = useCallback(async () => {
    if (!session?.orgId || !session.accessToken) return;
    const [o, s, b] = await Promise.all([
      api.get<OrgDetail>(`/v1/organizations/${session.orgId}`, session.accessToken),
      api.get<Settings>(`/v1/organizations/${session.orgId}/settings`, session.accessToken),
      api.get<Brand>(`/v1/organizations/${session.orgId}/brand`, session.accessToken),
    ]);
    setOrg(o);
    setSettings(s);
    setBrand(b);
    setForm({
      timezone: s.timezone,
      defaultLocale: s.defaultLocale,
      enforceMfa: Boolean(s.securityPolicy.enforceMfa),
      sessionMaxHours: Number(s.securityPolicy.sessionMaxHours ?? 24),
    });
  }, [session]);

  useEffect(() => {
    if (!ready || !session?.orgId) return;
    void load().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل لوحة الإدارة'));
  }, [ready, session, load]);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.orgId || !session.accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/v1/organizations/${session.orgId}/settings/security-policy`, {
        enforceMfa: form.enforceMfa,
        sessionMaxHours: form.sessionMaxHours,
      }, session.accessToken);
      await api.patch(`/v1/organizations/${session.orgId}/settings`, {
        timezone: form.timezone,
        defaultLocale: form.defaultLocale,
      }, session.accessToken);
      setNotice('تم حفظ إعدادات الإدارة الأساسية.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حفظ الإعدادات');
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Admin" subtitle="An executive layer for workspace governance, security defaults, branding signals and operational shortcuts.">
      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <Reveal>
        <div className="section-grid three">
          <StatTile label="Members" value={org?.counts?.members ?? 0} hint="Active people inside this workspace." />
          <StatTile label="Teams" value={org?.counts?.teams ?? 0} hint="Operational groups organized under this workspace." />
          <StatTile label="Security" value={form.enforceMfa ? 'MFA ON' : 'MFA OFF'} hint="Default protection state for member sessions." />
        </div>
      </Reveal>

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Workspace Overview" title={org?.name ?? 'Workspace overview'} body={org ? `Slug: ${org.slug} • Timezone: ${org.timezone}` : 'Workspace metadata will appear here once loaded.'} />
            {org ? (
              <div className="section-grid two">
                <StatTile label="Status" value={org.status} />
                <StatTile label="Locale" value={org.defaultLocale} />
                <StatTile label="Departments" value={org.counts?.departments ?? 0} />
                <StatTile label="Role Layer" value="Admin ready" />
              </div>
            ) : (
              <EmptyState title="Workspace not loaded" body="The admin overview will appear once the workspace context has been resolved from your authenticated session." />
            )}
          </GlassCard>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Policies" title="Control the default operating rules." body="These settings shape security posture and locale/time behavior for the current workspace." />
            <form onSubmit={saveSettings}>
              <div className="field">
                <label htmlFor="timezone">Timezone</label>
                <input id="timezone" value={form.timezone} onChange={(e) => setForm((cur) => ({ ...cur, timezone: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="locale">Default Locale</label>
                <input id="locale" value={form.defaultLocale} onChange={(e) => setForm((cur) => ({ ...cur, defaultLocale: e.target.value }))} />
              </div>
              <div className="field">
                <label htmlFor="sessionMaxHours">Session Lifetime (hours)</label>
                <input id="sessionMaxHours" type="number" min={1} max={720} value={form.sessionMaxHours} onChange={(e) => setForm((cur) => ({ ...cur, sessionMaxHours: Number(e.target.value) }))} />
              </div>
              <label className="row" style={{ alignItems: 'center', marginBottom: 18 }}>
                <input type="checkbox" checked={form.enforceMfa} onChange={(e) => setForm((cur) => ({ ...cur, enforceMfa: e.target.checked }))} style={{ width: 18, height: 18 }} />
                <span>فرض MFA على الأعضاء</span>
              </label>
              <button className="btn btn-primary" type="submit" disabled={busy}><ShieldCheck size={16} /> {busy ? 'Saving…' : 'Save Policies'}</button>
            </form>
          </GlassCard>
        </Reveal>
      </div>

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Admin Shortcuts" title="Jump into adjacent control surfaces." body="Everything here points to a focused area of the product shell, while preserving one unified premium dashboard language." />
          <div className="section-grid two">
            {[
              { href: '/dashboard/billing/', title: 'Billing Console', body: 'Commercial profile, plan selection and Stripe test mode.', icon: BadgeCheck },
              { href: '/dashboard/assets/', title: 'Asset Governance', body: 'Curate and classify images, videos and brand assets.', icon: FolderCog },
              { href: '/dashboard/channels/', title: 'Channel Control', body: 'Wire output destinations and distribution readiness.', icon: UsersRound },
              { href: '/dashboard/settings/', title: 'Integration Setup', body: 'AI providers, video engines and OAuth credentials.', icon: Settings2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <HoverLift key={item.href}>
                  <Link href={item.href} className="glass-card" style={{ display: 'block' }}>
                    <div className="feature-icon"><Icon size={20} /></div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </Link>
                </HoverLift>
              );
            })}
          </div>
          {brand ? (
            <div className="glass-card" style={{ marginTop: 18 }}>
              <p className="eyebrow subtle">Brand Signal</p>
              <h3>{brand.brandName ?? 'Default brand identity'}</h3>
              <p>Primary color: <span className="mono">{brand.primaryColor}</span> • Powered by hidden: {brand.hidePoweredBy ? 'Yes' : 'No'}</p>
            </div>
          ) : null}
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}

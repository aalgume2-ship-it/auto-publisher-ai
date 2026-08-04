'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Bell, CreditCard, FolderKanban, LayoutDashboard, LogOut, MenuSquare, RadioTower, Settings2, Sparkles, UserCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { clearSession, readClaims, type StoredSession } from '../../lib/session';

const NAV_ITEMS = [
  { href: '/dashboard/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/series/', label: 'Studio', icon: Sparkles },
  { href: '/dashboard/assets/', label: 'Assets', icon: FolderKanban },
  { href: '/dashboard/channels/', label: 'Channels', icon: RadioTower },
  { href: '/dashboard/posts/', label: 'Publishing', icon: MenuSquare },
  { href: '/dashboard/billing/', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/admin/', label: 'Admin', icon: UserCircle2 },
  { href: '/dashboard/settings/', label: 'Settings', icon: Settings2 },
] as const;

export interface AppShellProps {
  session: StoredSession;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({ session, title, subtitle, actions, children }: AppShellProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const claims = readClaims(session.accessToken);
  const displayName = session.displayName ?? session.email?.split('@')[0] ?? claims.email ?? claims.sub ?? 'Creator';

  function logout() {
    clearSession();
    router.replace('/login/');
  }

  return (
    <div className="app-shell">
      <aside className="dashboard-sidebar">
        <div className="brand-block glass-panel">
          <Link href="/" className="brand-link">
            <span className="brand-mark">A</span>
            <div>
              <strong>AutoCreator</strong>
              <span>AI Studio</span>
            </div>
          </Link>
        </div>
        <nav className="sidebar-nav glass-panel" aria-label="Dashboard navigation">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard/' && pathname.startsWith(item.href));
            return (
              <motion.div key={item.href} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: index * 0.04 }}>
                <Link href={item.href} className={`sidebar-link${active ? ' active' : ''}`}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </nav>
        <div className="sidebar-foot glass-panel">
          <div className="sidebar-user">
            <span className="avatar-badge">{String(displayName).slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{displayName}</strong>
              <span>{session.email ?? 'Signed in'}</span>
            </div>
          </div>
          <button className="ghost-inline" onClick={logout}>
            <LogOut size={16} /> تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar glass-strip">
          <div>
            <p className="eyebrow subtle">Creative Control Center</p>
            <h1>{title}</h1>
            <p className="topbar-subtitle">{subtitle}</p>
          </div>
          <div className="topbar-tools">
            <label className="search-shell">
              <span>⌘K</span>
              <input placeholder="Search projects, assets, channels…" aria-label="Search" />
            </label>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={18} />
              <em>0</em>
            </button>
            {actions}
          </div>
        </header>
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}

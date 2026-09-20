'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, LayoutGrid, FolderKanban, Palette, LogIn } from 'lucide-react';
import { loadStudioSession } from '../../lib/studio-session';

/**
 * Simplified Arabic-first marketing header:
 * Create Campaign | My Campaigns | Templates | Brand Kit  +  Account
 */
export default function CampaignHeader({ active }: { active?: 'create' | 'campaigns' | 'templates' | 'brand' }) {
  const router = useRouter();
  const session = typeof window !== 'undefined' ? loadStudioSession() : null;

  const links: { id: 'create' | 'campaigns' | 'templates' | 'brand'; href: string; label: string; icon: typeof Sparkles }[] = [
    { id: 'create', href: '/campaign/new', label: 'إنشاء حملة', icon: Sparkles },
    { id: 'campaigns', href: '/campaigns', label: 'حملاتي', icon: FolderKanban },
    { id: 'templates', href: '/presets', label: 'القوالب', icon: LayoutGrid },
    { id: 'brand', href: '/assets', label: 'هوية العلامة', icon: Palette },
  ];

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, backdropFilter: 'blur(14px)', background: 'rgba(8,8,14,0.72)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 20px', maxWidth: 1180 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 17, textDecoration: 'none', color: 'inherit' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#D4FF32,#7C5CFF)', color: '#0a0a10' }}><Sparkles size={16} /></span>
          Lumen
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {links.map(({ id, href, label, icon: Icon }) => (
            <Link key={id} href={href} className={`navlink ${active === id ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, fontSize: 14, textDecoration: 'none', background: active === id ? 'rgba(212,255,50,0.12)' : 'transparent' }}>
              <Icon size={14} /> {label}
            </Link>
          ))}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {session ? (
            <Link href="/campaigns" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }}>
              <LayoutGrid size={14} /> لوحة الحملات
            </Link>
          ) : (
            <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={() => router.push('/login?next=%2Fcampaigns')}>
              <LogIn size={14} /> دخول
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

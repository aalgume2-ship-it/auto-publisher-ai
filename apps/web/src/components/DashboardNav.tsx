'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/dashboard/', label: 'الرئيسية', exact: true },
  { href: '/dashboard/channels/', label: 'القنوات' },
  { href: '/dashboard/series/', label: 'السلاسل' },
  { href: '/dashboard/assets/', label: 'الأصول' },
  { href: '/dashboard/posts/', label: 'النشر' },
  { href: '/dashboard/billing/', label: 'Billing' },
  { href: '/dashboard/admin/', label: 'الإدارة' },
  { href: '/dashboard/settings/', label: 'الإعدادات' },
] as const;

/** Internal dashboard tabs — shared chrome for all wizard/product screens. */
export default function DashboardNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="dash-tabs" aria-label="أقسام لوحة التحكم">
      {TABS.map((t) => {
        const active = 'exact' in t && t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`dash-tab${active ? ' active' : ''}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

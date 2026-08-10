'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { LayoutDashboard, LogOut, Sparkles } from 'lucide-react';
import { loadStudioSession, clearStudioSession } from '../../lib/studio-session';

export function Logo() {
  return (
    <Link href="/" className="brand">
      <motion.span
        initial={{ rotate: -12, scale: 0.9 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        style={{
          width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg,#a3e635 0%,#84cc16 55%,#65a30d 100%)', color: '#0a1300', boxShadow: '0 8px 24px rgba(132,204,22,0.38)',
        }}
      >
        <Sparkles size={18} />
      </motion.span>
      <span>
        Lumen
        <small>AI Video Studio</small>
      </span>
    </Link>
  );
}

export default function StudioNav({ minimal = false }: { minimal?: boolean }) {
  const apiUser = loadStudioSession();
  const user = apiUser ? { name: apiUser.user.email.split('@')[0], plan: apiUser.plan } : null;

  function logout() {
    clearStudioSession();
    window.location.href = '/';
  }

  return (
    <motion.nav
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="snav glass"
    >
      <Logo />
      {!minimal && (
        <div className="navlinks">
          <Link className="navlink" href="/#studio">Create</Link>
          <Link className="navlink" href="/#models">Models</Link>
          <Link className="navlink" href="/#pricing">Pricing</Link>
          {user && <Link className="navlink" href="/dashboard">Dashboard</Link>}
        </div>
      )}
      <div className="cta-row">
        {user ? (
          <>
            <Link className="chip" href="/dashboard" style={{ textDecoration: 'none' }}>
              <LayoutDashboard size={13} /> {user.name}
              {user.plan ? ` · ${user.plan}` : ''}
            </Link>
            <button className="chip" onClick={logout} title="Sign out"><LogOut size={13} /></button>
            <Link className="btn btn-primary" href="/create">New video</Link>
          </>
        ) : (
          <>
            <Link className="btn btn-ghost" href="/login">Sign in</Link>
            <Link className="btn btn-primary" href="/signup">Get started</Link>
          </>
        )}
      </div>
    </motion.nav>
  );
}

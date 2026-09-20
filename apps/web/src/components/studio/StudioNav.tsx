'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { FolderKanban, History, Images, Sparkles } from 'lucide-react';

export function Logo() {
  return (
    <Link href="/video" className="brand" aria-label="Lumen Studio">
      <motion.span
        initial={{ rotate: -10, scale: 0.92 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'grid',
          placeItems: 'center',
          background: '#d4ff32',
          color: '#080808',
          boxShadow: '0 0 28px rgba(212,255,50,.22)',
        }}
      >
        <Sparkles size={17} />
      </motion.span>
      <span style={{ lineHeight: 1.05 }}>
        Lumen
        <small style={{ display: 'block', marginTop: 4 }}>Creative Studio</small>
      </span>
    </Link>
  );
}

export default function StudioNav({ minimal = false }: { minimal?: boolean }) {
  return (
    <motion.nav
      initial={{ y: -18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.38 }}
      className="snav glass"
      style={{
        background: 'rgba(10,10,11,.92)',
        borderColor: '#262629',
        boxShadow: '0 12px 40px rgba(0,0,0,.28)',
      }}
    >
      <Logo />

      <div className="navlinks" style={{ marginInline: 'auto', gap: 6 }}>
        <Link className="navlink active" href="/campaign/new">Create Campaign</Link>
        <Link className="navlink" href="/campaigns">My Campaigns</Link>
        <Link className="navlink" href="/video">Video Studio</Link>
      </div>

      <div className="cta-row" style={{ gap: 7 }}>
        <Link className="chip" href="/campaigns" style={{ textDecoration: 'none' }}><History size={14} /> Campaigns</Link>
        {!minimal && <Link className="chip" href="/presets" style={{ textDecoration: 'none' }}><FolderKanban size={14} /> Templates</Link>}
        {!minimal && <Link className="chip" href="/assets" style={{ textDecoration: 'none' }}><Images size={14} /> Brand Kit</Link>}
      </div>
    </motion.nav>
  );
}

'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

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
        </div>
      )}
      <div className="cta-row">
        <Link className="btn btn-primary" href="/create">New video</Link>
      </div>
    </motion.nav>
  );
}

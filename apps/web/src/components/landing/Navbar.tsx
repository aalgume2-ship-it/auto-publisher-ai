'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const LINKS = [
  { label: 'Create', href: '/create' },
  { label: 'Models', href: '/#models' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/#pricing' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#070708]/80 backdrop-blur-xl border-b border-[#1d1d1f]' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-5">
        {/* Brand */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#D4FF32] text-[#0b0d0a] shadow-[0_0_22px_rgba(212,255,50,0.35)] transition-shadow group-hover:shadow-[0_0_30px_rgba(212,255,50,0.55)]">
            <Sparkles size={17} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-white">
            Lumen<span className="text-[#D4FF32]">.</span>
          </span>
        </Link>

        {/* Minimalist links — gray → lime on hover */}
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-all duration-200 hover:text-[#D4FF32] hover:bg-[#D4FF32]/10"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* CTAs — auth-free during preview */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/create"
            className="rounded-full bg-[#D4FF32] px-5 py-2.5 text-sm font-bold text-[#0b0d0a] shadow-[0_10px_34px_rgba(212,255,50,0.28)] transition-all duration-200 hover:bg-[#E4FF66] hover:shadow-[0_14px_44px_rgba(212,255,50,0.42)] hover:-translate-y-0.5"
          >
            Start creating
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}

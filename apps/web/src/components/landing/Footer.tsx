'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-[#1d1d1f] py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#D4FF32] text-[#0b0d0a]">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-semibold text-[#A1A1AA]">
            © 2026 Lumen Studio
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/#models" className="text-sm text-[#A1A1AA] transition-colors hover:text-[#D4FF32]">Models</Link>
          <Link href="/#features" className="text-sm text-[#A1A1AA] transition-colors hover:text-[#D4FF32]">Features</Link>
          <Link href="/#pricing" className="text-sm text-[#A1A1AA] transition-colors hover:text-[#D4FF32]">Pricing</Link>
          <Link href="/login" className="text-sm text-[#A1A1AA] transition-colors hover:text-[#D4FF32]">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}

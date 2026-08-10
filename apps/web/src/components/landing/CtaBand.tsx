'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function CtaBand() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 pb-24 pt-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-[#D4FF32]/25 bg-[#141416] px-8 py-16 text-center shadow-[0_0_0_1px_rgba(212,255,50,0.12),0_30px_90px_rgba(0,0,0,0.5)]"
      >
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full bg-[#D4FF32]/10 blur-[90px]" />
        <div className="relative">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Ready to make your{' '}
            <span className="bg-gradient-to-r from-[#f4ffd6] via-[#D4FF32] to-[#84b800] bg-clip-text text-transparent">
              best video yet?
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[#A1A1AA]">
            Start creating free — no account needed. Your first cinematic render is a prompt away.
          </p>
          <Link
            href="/create"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[#D4FF32] px-8 py-4 text-base font-bold text-[#0b0d0a] shadow-[0_0_0_1px_rgba(212,255,50,0.4),0_18px_55px_rgba(212,255,50,0.35)] transition-all duration-200 hover:bg-[#E4FF66] hover:-translate-y-0.5"
          >
            Start creating free
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

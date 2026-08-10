'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Check, Sparkles } from 'lucide-react';

const TRUST = ['No account to start', 'Cloud rendering', 'Real downloadable files'];

type Cubic = [number, number, number, number];
const EASE: Cubic = [0.16, 1, 0.3, 1];

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: EASE as Cubic },
});

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-36 pb-24 sm:pt-44 sm:pb-28">
      {/* ambient lime glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[#D4FF32]/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute top-40 -left-24 h-[360px] w-[360px] rounded-full bg-[#D4FF32]/[0.05] blur-[100px]" />

      <div className="relative mx-auto w-full max-w-6xl px-5 text-center">
        {/* Eyebrow */}
        <motion.div {...fade(0)} className="mb-7 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#D4FF32]/30 bg-[#D4FF32]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#D4FF32]">
            <Sparkles size={13} /> Lumen Studio · AI video from a single prompt
          </span>
        </motion.div>

        {/* Huge gradient typography */}
        <motion.h1
          {...fade(0.08)}
          className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.03] tracking-tighter text-white sm:text-6xl md:text-7xl lg:text-8xl"
        >
          Turn one prompt into a{' '}
          <span className="bg-gradient-to-r from-[#f4ffd6] via-[#D4FF32] to-[#84b800] bg-clip-text text-transparent">
            cinematic video.
          </span>
        </motion.h1>

        <motion.p
          {...fade(0.16)}
          className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#A1A1AA]"
        >
          Choose a model, set the style and aspect, describe your scene, and watch it render live —
          then download, upscale or remix in one click.
        </motion.p>

        {/* CTAs */}
        <motion.div
          {...fade(0.24)}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/create"
            className="group inline-flex items-center gap-2 rounded-full bg-[#D4FF32] px-8 py-4 text-base font-bold text-[#0b0d0a] shadow-[0_0_0_1px_rgba(212,255,50,0.4),0_18px_55px_rgba(212,255,50,0.35)] transition-all duration-200 hover:bg-[#E4FF66] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(212,255,50,0.5),0_24px_70px_rgba(212,255,50,0.45)]"
          >
            Start creating
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/#how"
            className="inline-flex items-center gap-2 rounded-full border border-[#2b2b2e] bg-[#141416] px-7 py-4 text-base font-semibold text-[#F4F4F5] transition-all duration-200 hover:border-[#D4FF32]/40 hover:bg-[#D4FF32]/5 hover:text-[#D4FF32]"
          >
            <Play size={16} fill="currentColor" /> Watch how it works
          </Link>
        </motion.div>

        {/* Trust row */}
        <motion.div {...fade(0.32)} className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
          {TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-2 text-sm font-medium text-[#A1A1AA]">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[#D4FF32]/15 text-[#D4FF32]">
                <Check size={11} strokeWidth={3} />
              </span>
              {t}
            </span>
          ))}
        </motion.div>

        {/* Studio preview mockup */}
        <motion.div
          {...fade(0.4)}
          className="relative mx-auto mt-16 max-w-3xl"
        >
          <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-[#D4FF32]/20 to-transparent opacity-60 blur-sm" />
          <div className="relative overflow-hidden rounded-3xl border border-[#232323] bg-[#141416] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-2 rounded-2xl bg-[#0d0d0f] px-4 py-3">
              <span className="flex gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-[#2b2b2e]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#2b2b2e]" />
                <i className="h-2.5 w-2.5 rounded-full bg-[#2b2b2e]" />
              </span>
              <span className="ml-3 flex-1 rounded-lg bg-[#141416] border border-[#232323] px-3 py-1.5 text-left text-sm text-[#A1A1AA]">
                A neon-lit cyberpunk street in the rain, cinematic 4K…
              </span>
              <span className="rounded-full bg-[#D4FF32] px-4 py-1.5 text-xs font-bold text-[#0b0d0a]">
                Generate
              </span>
            </div>
            <div className="mt-3 grid aspect-video w-full place-items-center rounded-2xl bg-[radial-gradient(circle_at_50%_30%,#1d1d20,#0a0a0b_70%)] border border-[#232323]">
              <span className="text-sm font-medium text-[#A1A1AA]">Your AI render preview</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

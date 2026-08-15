'use client';

import { motion } from 'framer-motion';
import { PenLine, SlidersHorizontal, Clapperboard } from 'lucide-react';

const STEPS = [
  { icon: PenLine, n: '01', t: 'Describe', d: 'Write one prompt — your idea, your style, your words.' },
  { icon: SlidersHorizontal, n: '02', t: 'Tune', d: 'Pick a model, aspect ratio, style and duration in seconds.' },
  { icon: Clapperboard, n: '03', t: 'Render & share', d: 'Watch it render live, then download, upscale or remix.' },
];

export default function Workflow() {
  return (
    <section id="how" className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="mb-12 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#D4FF32]">How it works</span>
        <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          From prompt to premiere
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative overflow-hidden rounded-2xl border border-[#232323] bg-[#141416] p-6"
            >
              <span className="absolute right-5 top-4 text-5xl font-extrabold text-[#D4FF32]/10">{s.n}</span>
              <div className="mb-5 inline-grid h-12 w-12 place-items-center rounded-xl bg-[#D4FF32]/10 text-[#D4FF32] shadow-[0_0_20px_rgba(212,255,50,0.30)]">
                <Icon size={22} />
              </div>
              <h3 className="text-lg font-bold text-white">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">{s.d}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

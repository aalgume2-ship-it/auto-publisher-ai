'use client';

import { motion } from 'framer-motion';
import { Zap, Layers, Cpu, ShieldCheck, Share2, Box } from 'lucide-react';

const FEATURES = [
  { icon: Zap, t: 'Renders in seconds', d: 'Studio pipeline with real AI providers — no fake queues, your draft starts instantly and streams progress.' },
  { icon: Layers, t: 'Total creative control', d: 'Model, style, aspect ratio and duration tuned before you render — your prompt, your way.' },
  { icon: Cpu, t: 'Real output, real files', d: 'Every render is encoded to a genuine video file you can download, share and remix.' },
  { icon: Box, t: 'One canvas, every workflow', d: 'Moodboard, chain workflows and share with your team — all on a single canvas.' },
  { icon: ShieldCheck, t: 'Secure & private', d: 'Your ideas are encrypted, processed on our isolated studio pipeline, and never shared.' },
  { icon: Share2, t: 'Share & remix', d: 'Publish straight to your channels or drop a link — collaborators see every prompt and asset.' },
];

export default function Features() {
  return (
    <section id="features" className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="mb-12 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#D4FF32]">Features</span>
        <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Built for every workflow
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[#A1A1AA]">
          A complete creative stack — from a single prompt to a finished, shareable video.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.t}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group rounded-2xl border border-[#232323] bg-[#141416] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#D4FF32]/40 hover:shadow-[0_0_44px_rgba(212,255,50,0.08)]"
            >
              <div className="mb-5 inline-grid h-12 w-12 place-items-center rounded-xl bg-[#D4FF32]/10 text-[#D4FF32] shadow-[0_0_20px_rgba(212,255,50,0.30)] transition-shadow duration-300 group-hover:shadow-[0_0_30px_rgba(212,255,50,0.5)]">
                <Icon size={22} />
              </div>
              <h3 className="text-lg font-bold text-white">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#A1A1AA]">{f.d}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

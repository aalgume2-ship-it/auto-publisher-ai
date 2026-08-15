'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';

const PLANS = [
  { name: 'Free', price: '$0', blurb: 'For trying the studio.', items: ['3 renders / day', '720p output', 'All models'], featured: false },
  { name: 'Pro', price: '$12', blurb: 'For serious creators.', items: ['Unlimited renders', '4K output', 'Priority pipeline', 'No watermark'], featured: true },
  { name: 'Studio', price: '$39', blurb: 'For teams and agencies.', items: ['Unlimited + API', 'Team seats', 'Brand styles', 'Dedicated support'], featured: false },
];

export default function Pricing() {
  return (
    <section id="pricing" className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20">
      <div className="mb-12 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#D4FF32]">Pricing</span>
        <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Simple, honest pricing
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[#A1A1AA]">
          Start free. Upgrade when you need more renders.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.06 }}
            className={`relative flex flex-col rounded-2xl border p-7 ${
              p.featured
                ? 'border-[#D4FF32]/50 bg-[#141416] shadow-[0_0_0_1px_rgba(212,255,50,0.35),0_24px_70px_rgba(212,255,50,0.12)]'
                : 'border-[#232323] bg-[#141416]'
            }`}
          >
            {p.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#D4FF32] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#0b0d0a] shadow-[0_0_20px_rgba(212,255,50,0.4)]">
                Most popular
              </span>
            )}
            <div className="mb-2 text-sm font-bold text-[#D4FF32]">{p.name}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-extrabold tracking-tight text-white">{p.price}</span>
              <span className="text-sm text-[#A1A1AA]">/mo</span>
            </div>
            <p className="mt-2 text-sm text-[#A1A1AA]">{p.blurb}</p>
            <ul className="mt-6 flex flex-col gap-3">
              {p.items.map((it) => (
                <li key={it} className="flex items-start gap-2.5 text-sm text-[#A1A1AA]">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#D4FF32]/15 text-[#D4FF32]">
                    <Check size={11} strokeWidth={3} />
                  </span>
                  {it}
                </li>
              ))}
            </ul>
            <Link
              href="/subscribe"
              className={`group mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold transition-all duration-200 ${
                p.featured
                  ? 'bg-[#D4FF32] text-[#0b0d0a] shadow-[0_12px_38px_rgba(212,255,50,0.3)] hover:bg-[#E4FF66] hover:-translate-y-0.5'
                  : 'border border-[#2b2b2e] bg-transparent text-white hover:border-[#D4FF32]/40 hover:text-[#D4FF32]'
              }`}
            >
              {p.name === 'Free' ? 'Start free' : `Get ${p.name}`}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

'use client';

import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Workflow from '../components/landing/Workflow';
import Pricing from '../components/landing/Pricing';
import CtaBand from '../components/landing/CtaBand';
import Footer from '../components/landing/Footer';

/**
 * Lumen Studio — landing page.
 * Pixel-perfect, Higgsfield-inspired dark marketing page built entirely with
 * Tailwind utility classes on the new palette (globals.css + tailwind.config.mjs):
 *   · absolute black background  #070708
 *   · bright lime CTA             #D4FF32 (volt) with black text + glow
 *   · minimalist navbar, gray links #A1A1AA → lime on hover
 *   · feature cards               bg #141416 / hairline border #232323, lime glow icons
 */
export default function Landing() {
  return (
    <div
      dir="ltr"
      className="min-h-screen bg-[#070708] font-body text-white antialiased selection:bg-[#D4FF32] selection:text-[#0b0d0a]"
    >
      <Navbar />
      <main className="relative">
        <Hero />
        <Features />
        <Workflow />
        <Pricing />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}

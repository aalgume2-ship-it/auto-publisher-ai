"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Wand2, Target, Users, Film, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const STEPS = [
  { id: 'idea', title: 'Core Idea', icon: Wand2 },
  { id: 'audience', title: 'Audience & Platform', icon: Target },
  { id: 'character', title: 'Character Brain', icon: Users },
  { id: 'style', title: 'Cinematic Style', icon: Film },
]

export default function PromptBuilderWizard() {
  const [step, setStep] = useState(0)

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="h-16 border-b border-[#27272a] flex items-center px-8 justify-between">
        <span className="font-bold text-lg">Prompt Compiler</span>
        <Button variant="ghost" asChild><Link href="/studio">Exit Wizard</Link></Button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/10 via-black to-black pointer-events-none"></div>

        <div className="w-full max-w-2xl z-10">
          <div className="flex justify-between mb-12">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`flex flex-col items-center gap-2 ${i <= step ? 'text-purple-400' : 'text-zinc-600'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${i <= step ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium uppercase tracking-wider">{s.title}</span>
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">What do you want to create?</h1>
                <textarea 
                  className="w-full h-40 bg-[#18181b] border border-[#27272a] rounded-xl p-6 text-lg text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all placeholder:text-zinc-600"
                  placeholder="e.g. Explain quantum computing using a cyberpunk city analogy..."
                />
              </motion.div>
            )}

            {step === 1 && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">Target Audience</h1>
                <div className="grid grid-cols-2 gap-4">
                  {['Kids (Playful)', 'Teen (Trendy)', 'Professionals (Formal)', 'General (Engaging)'].map((aud, i) => (
                    <div key={i} className="p-4 border border-[#27272a] bg-[#18181b] rounded-lg cursor-pointer hover:border-purple-500 transition-colors">
                      {aud}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            
            {step === 2 && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">Select Identity</h1>
                <div className="grid grid-cols-3 gap-4">
                  {['Marcus (Tech)', 'Aria (News)', 'Nova (Sci-Fi)'].map((char, i) => (
                    <div key={i} className="aspect-[3/4] border border-[#27272a] bg-zinc-900 rounded-lg cursor-pointer hover:border-purple-500 transition-colors relative overflow-hidden group">
                      <img src={`https://picsum.photos/seed/${char}/400/600`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur p-3 text-sm font-medium">{char}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
                <h1 className="text-4xl font-bold tracking-tight">Compiling Blueprint</h1>
                <p className="text-zinc-400">The Prompt Compiler is turning your simple intent into a full ACE render graph.</p>
                <div className="p-6 bg-[#18181b] border border-[#27272a] rounded-xl font-mono text-xs text-purple-300">
                  {`{
  "story": { "chapters": 3 },
  "director": { "pacing": "fast", "lighting": "cyberpunk_neon" },
  "camera": { "initial": "orbit", "secondary": "dolly_in" },
  "character": { "id": "nova", "emotion": "amazed" }
}`}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0}>Back</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => Math.min(3, s+1))} variant="secondary" className="gap-2">Continue <ArrowRight className="w-4 h-4"/></Button>
            ) : (
              <Button asChild variant="premium" className="gap-2"><Link href="/studio"><Sparkles className="w-4 h-4"/> Open in Studio</Link></Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

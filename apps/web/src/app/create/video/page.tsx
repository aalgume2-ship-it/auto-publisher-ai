"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ArrowRight, Wand2, Sparkles, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: 'format', title: 'Format' },
  { id: 'prompt', title: 'Idea' },
  { id: 'character', title: 'Character' },
  { id: 'voice', title: 'Voice' },
  { id: 'style', title: 'Style' },
  { id: 'quality', title: 'Quality' },
]

export default function CreateVideoWizard() {
  const [currentStep, setCurrentStep] = useState(0)

  return (
    <div className="flex flex-col min-h-screen bg-[#000000] relative">
      {/* Header Stepper */}
      <header className="h-16 border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/create">
            <Button variant="ghost" size="icon" className="text-zinc-400 rounded-full h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-semibold text-white">New Generation</span>
        </div>
        
        <div className="flex items-center gap-2">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full transition-all",
                idx === currentStep ? "bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] scale-125" : 
                idx < currentStep ? "bg-zinc-300" : "bg-zinc-700"
              )} />
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  "w-8 h-0.5 mx-1 transition-all",
                  idx < currentStep ? "bg-zinc-300" : "bg-zinc-800"
                )} />
              )}
            </div>
          ))}
        </div>
        
        <div className="text-sm font-medium text-zinc-400">
          Est. Cost: <span className="text-white">12 Credits</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 flex justify-center">
        <div className="max-w-3xl w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="mt-8"
            >
              {currentStep === 0 && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Select Format</h2>
                  <p className="text-zinc-400">Choose the destination platform to set the correct aspect ratio and duration limits.</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    {['TikTok / Shorts (9:16)', 'YouTube (16:9)', 'Instagram Square (1:1)', 'Cinematic Widescreen (21:9)'].map((fmt, i) => (
                      <div key={i} className="p-6 rounded-xl border border-[#27272a] bg-[#18181b] hover:border-purple-500/50 cursor-pointer transition-all flex flex-col gap-4 group">
                        <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center group-hover:bg-purple-500/20 group-hover:text-purple-400 text-zinc-400">
                          {/* Mock Icon */}
                          <div className={cn("border-2 border-current rounded-sm", 
                            i === 0 ? "w-4 h-6" : i === 1 ? "w-6 h-4" : i === 2 ? "w-5 h-5" : "w-8 h-3")} />
                        </div>
                        <span className="font-medium text-white">{fmt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-white tracking-tight">What's the idea?</h2>
                  <p className="text-zinc-400">Describe what you want to create, and our AI will build a complete scene-by-scene script.</p>
                  
                  <textarea 
                    className="w-full h-40 bg-[#18181b] border border-[#27272a] rounded-xl p-4 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none transition-all"
                    placeholder="E.g., A cinematic documentary intro about the history of Rome, starting with an orbit shot around the Colosseum..."
                  ></textarea>

                  <Button variant="secondary" className="gap-2">
                    <Wand2 className="w-4 h-4" /> Expand with AI
                  </Button>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-3xl font-bold text-white tracking-tight">Select Character</h2>
                      <p className="text-zinc-400">Pick from your trained studio characters or generate a new one.</p>
                    </div>
                    <Button variant="outline" size="sm">Train New Character</Button>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mt-8">
                    {['Aria (News Anchor)', 'Marcus (Tech Reviewer)', 'Nova (Cyberpunk)'].map((char, i) => (
                      <div key={i} className="group relative rounded-xl border border-[#27272a] overflow-hidden aspect-[3/4] cursor-pointer">
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
                        <img src={`https://picsum.photos/seed/${char}/400/600`} alt={char} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute bottom-4 left-4 z-20">
                          <div className="font-medium text-white">{char}</div>
                          <div className="text-xs text-zinc-300">Consistent Identity</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* I'll stub the rest to keep it concise, just showing the final step transition to loading */}
              {currentStep > 2 && (
                <div className="space-y-6">
                  <h2 className="text-3xl font-bold text-white tracking-tight">{STEPS[currentStep].title}</h2>
                  <p className="text-zinc-400">Configure {STEPS[currentStep].title.toLowerCase()} settings for this project.</p>
                  <div className="h-64 border border-[#27272a] border-dashed rounded-xl flex items-center justify-center text-zinc-500">
                    {STEPS[currentStep].title} Configuration UI
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Footer Controls */}
          <div className="mt-12 flex justify-between items-center pt-6 border-t border-[#27272a]">
            <Button 
              variant="ghost" 
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
            >
              Back
            </Button>
            
            {currentStep < STEPS.length - 1 ? (
              <Button 
                onClick={() => setCurrentStep(prev => Math.min(STEPS.length - 1, prev + 1))}
                className="gap-2"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Link href="/editor/generating">
                <Button variant="premium" className="gap-2">
                  <Sparkles className="w-4 h-4" /> Generate Project
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

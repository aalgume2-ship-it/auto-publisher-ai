"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, Loader2, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

const PHASES = [
  { id: 'script', label: 'Drafting Script & Prompts' },
  { id: 'character', label: 'Synthesizing Character Identity' },
  { id: 'voice', label: 'Generating Voice & Lip-sync Data' },
  { id: 'render', label: 'Rendering Video (Cinema Engine)' },
  { id: 'upscale', label: 'Upscaling to 4K & Final Mastering' }
]

export default function GeneratingPage() {
  const [activePhase, setActivePhase] = useState(0)
  const [progress, setProgress] = useState(0)
  const router = useRouter()

  useEffect(() => {
    // Simulate generation process
    const durationPerPhase = 2000; // ms
    const totalDuration = PHASES.length * durationPerPhase;
    
    let start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= totalDuration) {
        clearInterval(interval);
        router.push('/editor');
        return;
      }
      
      const currentPhaseIdx = Math.floor(elapsed / durationPerPhase);
      setActivePhase(currentPhaseIdx);
      
      const phaseProgress = ((elapsed % durationPerPhase) / durationPerPhase) * 100;
      setProgress(phaseProgress);
      
    }, 50);

    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-black to-black"></div>
      
      <div className="z-10 w-full max-w-lg p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-purple-500/30 flex items-center justify-center relative">
            <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
            <div className="absolute inset-0 border border-purple-400/50 rounded-2xl animate-ping opacity-20"></div>
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">Enterprise AI Orchestrator</h2>
        <p className="text-zinc-400 text-center text-sm mb-10">Building your project across distributed GPU clusters...</p>
        
        <div className="space-y-6">
          {PHASES.map((phase, idx) => {
            const isCompleted = idx < activePhase;
            const isActive = idx === activePhase;
            const isPending = idx > activePhase;
            
            return (
              <div key={phase.id} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {isCompleted ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-emerald-500" />
                      </div>
                    ) : isActive ? (
                      <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-zinc-700 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-700"></div>
                      </div>
                    )}
                    <span className={cn(
                      "text-sm font-medium transition-colors",
                      isCompleted ? "text-zinc-300" : isActive ? "text-white" : "text-zinc-600"
                    )}>
                      {phase.label}
                    </span>
                  </div>
                  {isActive && (
                    <span className="text-xs font-mono text-purple-400">{Math.round(progress)}%</span>
                  )}
                  {isCompleted && (
                    <span className="text-xs font-mono text-emerald-500">100%</span>
                  )}
                </div>
                
                {/* Progress bar line under text */}
                <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden ml-8" style={{ width: 'calc(100% - 2rem)' }}>
                  <motion.div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    initial={{ width: isCompleted ? '100%' : '0%' }}
                    animate={{ width: isCompleted ? '100%' : isActive ? `${progress}%` : '0%' }}
                    transition={{ ease: "linear", duration: 0.1 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

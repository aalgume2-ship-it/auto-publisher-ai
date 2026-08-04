"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ArrowRight, Save, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { cn } from "@/lib/utils"

export default function AutoPilotSetup() {
  const [step, setStep] = useState(0)

  return (
    <div className="flex flex-col min-h-screen bg-[#000000]">
      {/* Header */}
      <header className="h-16 border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/create">
            <Button variant="ghost" size="icon" className="text-zinc-400 rounded-full h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-semibold text-white">Configure AutoPilot Agent</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row max-w-6xl w-full mx-auto p-8 gap-12">
        
        {/* Left Form */}
        <div className="flex-1 space-y-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">1. Connect Platforms</h2>
                  <p className="text-zinc-400 text-sm">Select and authenticate the channels where this agent will publish automatically.</p>
                </div>
                
                <div className="space-y-3">
                  {[
                    { name: 'YouTube', icon: ({ className }: any) => <span className={className}>YT</span>, connected: true, color: 'text-red-500' },
                    { name: 'TikTok', icon: ({ className }: any) => <span className={cn("font-bold", className)}>t</span>, connected: false, color: 'text-white' },
                    { name: 'Instagram', icon: ({ className }: any) => <span className={className}>IG</span>, connected: false, color: 'text-pink-500' },
                    { name: 'LinkedIn', icon: ({ className }: any) => <span className={className}>IN</span>, connected: true, color: 'text-blue-500' },
                    { name: 'X (Twitter)', icon: ({ className }: any) => <span className={className}>X</span>, connected: false, color: 'text-white' },
                  ].map((platform, i) => (
                    <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-[#27272a] bg-[#18181b]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-black flex items-center justify-center border border-[#27272a]">
                          <platform.icon className={cn("w-5 h-5", platform.color)} />
                        </div>
                        <span className="font-medium text-white">{platform.name}</span>
                      </div>
                      
                      {platform.connected ? (
                        <Button variant="ghost" size="sm" className="text-emerald-500 gap-2 hover:text-emerald-400 hover:bg-emerald-500/10">
                          <Check className="w-4 h-4" /> Connected
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm">Connect</Button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-20}} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">2. Content Strategy</h2>
                  <p className="text-zinc-400 text-sm">Define what the agent will create.</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Niche / Topic</label>
                    <input type="text" className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none" placeholder="e.g. Daily Stoic Quotes, AI Tech News..." />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Frequency</label>
                    <select className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none appearance-none">
                      <option>1 Video per day</option>
                      <option>2 Videos per day</option>
                      <option>3 Videos per week</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-2 block">Identity Lock</label>
                    <div className="p-4 border border-[#27272a] rounded-lg bg-[#18181b] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800"></div>
                        <div>
                          <div className="text-sm font-medium text-white">Default Character</div>
                          <div className="text-xs text-zinc-500">Marcus (AI Avatar)</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Change</Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-6">
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            {step < 1 ? (
              <Button onClick={() => setStep(step + 1)} className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Link href="/dashboard" className="ml-auto">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Save className="w-4 h-4" /> Save & Activate Agent
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Right Preview */}
        <div className="w-80 flex-shrink-0 hidden md:block relative">
          <div className="sticky top-24 border border-[#27272a] bg-[#09090b] rounded-xl p-6 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[40px] rounded-full pointer-events-none"></div>
            
            <h3 className="text-sm font-medium text-white mb-4">Agent Summary</h3>
            
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Platforms</span>
                <span className="text-white font-medium text-right">YouTube, LinkedIn</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Volume</span>
                <span className="text-white font-medium text-right">30 videos/mo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Est. Cost</span>
                <span className="text-emerald-400 font-medium text-right">$45.00/mo</span>
              </div>
              
              <div className="pt-4 border-t border-[#27272a]">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 animate-pulse"></div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Once activated, the AI will research topics, generate scripts, render videos using your selected character, and publish them automatically without any manual intervention.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Film, Share2, ArrowRight } from "lucide-react"

export default function CreatePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">What do you want to achieve today?</h1>
        <p className="text-xl text-zinc-400">Select a workflow to begin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* Manual Video Generation */}
        <Link href="/create/video" className="group">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="h-full p-8 rounded-2xl border border-[#27272a] bg-[#09090b] hover:border-purple-500/50 hover:bg-[#18181b] transition-all relative overflow-hidden flex flex-col items-center text-center gap-6"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full group-hover:bg-purple-500/20 transition-all"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <Film className="w-8 h-8 text-purple-400" />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Create Single Video</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Open the Professional Studio. Full control over character, voice, camera angles, and timeline editing.
              </p>
            </div>
            
            <div className="mt-auto flex items-center text-sm font-medium text-purple-400 group-hover:text-purple-300">
              Launch Studio <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        </Link>

        {/* Auto Publish */}
        <Link href="/create/autopilot" className="group">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="h-full p-8 rounded-2xl border border-[#27272a] bg-[#09090b] hover:border-emerald-500/50 hover:bg-[#18181b] transition-all relative overflow-hidden flex flex-col items-center text-center gap-6"
          >
            <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 blur-[50px] rounded-full group-hover:bg-emerald-500/20 transition-all"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Share2 className="w-8 h-8 text-emerald-400" />
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Setup AutoPilot Agent</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Define a niche, schedule, and let the AI generate and publish videos automatically across all your social channels.
              </p>
            </div>
            
            <div className="mt-auto flex items-center text-sm font-medium text-emerald-400 group-hover:text-emerald-300">
              Configure Agent <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        </Link>
      </div>
    </div>
  )
}

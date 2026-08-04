"use client"

import { useStudioStore } from "@/store/studioStore"
import { Play, Pause, SkipBack, SkipForward, Frame, Minimize } from "lucide-react"

export function PreviewPlayer() {
  const { playheadMs, durationMs, isPlaying, togglePlayback, pipelineProgress, currentAiPhase, gpuUsage } = useStudioStore()

  // Format MS to MM:SS:FF
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const seconds = (totalSeconds % 60).toString().padStart(2, '0')
    const frames = Math.floor((ms % 1000) / (1000/30)).toString().padStart(2, '0') // Assuming 30fps
    return `${minutes}:${seconds}:${frames}`
  }

  return (
    <div className="flex-1 flex flex-col bg-[#000000] border-r border-[#27272a] relative overflow-hidden">
      {/* Top Status Bar */}
      <div className="h-10 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-4 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div> 60 FPS</span>
          <span>4K UHD (Safe Area ON)</span>
        </div>
        <div className="flex items-center gap-4">
          <span>GPU: {gpuUsage}%</span>
          <span className="text-purple-400">{currentAiPhase} {pipelineProgress}%</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-90 relative group">
        <div className="aspect-video w-full max-w-4xl bg-black border border-[#27272a] rounded-lg shadow-2xl relative overflow-hidden flex items-center justify-center">
          
          {/* Safe Area Grid */}
          <div className="absolute inset-[5%] border border-white/10 pointer-events-none z-10"></div>
          <div className="absolute inset-[10%] border border-white/5 pointer-events-none z-10"></div>
          
          {/* Mock Video Frame */}
          <img 
            src="https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1920&q=80" 
            alt="Current Frame" 
            className={`w-full h-full object-cover transition-opacity duration-300 ${currentAiPhase !== 'IDLE' ? 'opacity-50 blur-sm' : 'opacity-100'}`}
          />
          
          {/* Realtime Generation Overlay */}
          {currentAiPhase !== 'IDLE' && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-md z-20">
               <div className="text-2xl font-bold text-white mb-2">{currentAiPhase}</div>
               <div className="w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                 <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${pipelineProgress}%` }}></div>
               </div>
             </div>
          )}

        </div>
      </div>

      {/* Controls */}
      <div className="h-16 border-t border-[#27272a] bg-[#09090b] flex items-center justify-between px-6">
        <span className="text-sm font-mono text-zinc-400 w-24">{formatTime(playheadMs)}</span>
        
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400"><SkipBack className="w-4 h-4" /></button>
          <button className="w-8 h-8 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400"><Frame className="w-4 h-4" /></button>
          <button 
            className="w-10 h-10 rounded-full bg-white text-black hover:bg-zinc-200 flex items-center justify-center transition-transform active:scale-95"
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4 ml-1" fill="currentColor" />}
          </button>
          <button className="w-8 h-8 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400"><Frame className="w-4 h-4 scale-x-[-1]" /></button>
          <button className="w-8 h-8 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400"><SkipForward className="w-4 h-4" /></button>
        </div>

        <div className="flex justify-end w-24">
           <button className="w-8 h-8 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400"><Minimize className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  )
}

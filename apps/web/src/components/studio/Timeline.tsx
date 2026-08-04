"use client"

import { useStudioStore } from "@/store/studioStore"
import { Lock, Unlock, Volume2, VolumeX, Eye, EyeOff, Layers, Search, Plus } from "lucide-react"

export function Timeline() {
  const { tracks, playheadMs, durationMs, setPlayhead } = useStudioStore()

  // Calculate percentage for playhead position
  const playheadPercent = (playheadMs / durationMs) * 100

  return (
    <div className="h-72 border-t border-[#27272a] bg-[#09090b] flex flex-col flex-shrink-0 relative select-none">
      
      {/* Timeline Toolbar */}
      <div className="h-10 border-b border-[#27272a] bg-[#18181b] flex items-center px-4 justify-between">
        <div className="flex gap-2">
          <button className="h-7 px-3 rounded bg-[#27272a] text-xs text-white hover:bg-[#3f3f46] flex items-center gap-1.5"><Layers className="w-3 h-3"/> Sequence 1</button>
        </div>
        <div className="flex gap-2 items-center">
          <Search className="w-3 h-3 text-zinc-500" />
          <div className="w-32 h-1 bg-[#27272a] rounded-full overflow-hidden">
            <div className="w-1/3 h-full bg-zinc-500 rounded-full"></div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Track Headers (Left Column) */}
        <div className="w-64 border-r border-[#27272a] bg-[#09090b] overflow-y-auto flex flex-col pt-6">
          {tracks.map(track => (
            <div key={track.id} className="h-20 border-b border-[#27272a] px-3 flex flex-col justify-center group relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300 truncate pr-2">{track.name}</span>
                <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                  <button className="w-5 h-5 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400">
                    {track.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  <button className="w-5 h-5 rounded hover:bg-[#27272a] flex items-center justify-center text-zinc-400">
                    {track.isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="h-12 flex items-center justify-center text-xs text-zinc-600 hover:text-white cursor-pointer transition-colors gap-2">
            <Plus className="w-3 h-3" /> Add Track
          </div>
        </div>

        {/* Tracks Canvas (Right Area) */}
        <div className="flex-1 relative overflow-y-auto overflow-x-hidden bg-[#121214]" 
             onClick={(e) => {
               const rect = e.currentTarget.getBoundingClientRect()
               const x = e.clientX - rect.left
               const percent = x / rect.width
               setPlayhead(percent * durationMs)
             }}>
          
          {/* Time Ruler */}
          <div className="absolute top-0 left-0 w-full h-6 border-b border-[#27272a] bg-[#18181b] z-20 opacity-80 flex items-end">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="flex-1 border-l border-zinc-700 h-2 relative">
                 {i % 5 === 0 && <span className="absolute -top-4 -left-3 text-[10px] text-zinc-500 font-mono">00:0{i}</span>}
              </div>
            ))}
          </div>

          {/* Playhead Line */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-red-500 z-30 transition-all duration-75"
            style={{ left: `${playheadPercent}%` }}
          >
            <div className="absolute -top-1 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500"></div>
          </div>

          <div className="pt-6">
            {tracks.map(track => (
              <div key={track.id} className="h-20 border-b border-[#27272a] relative">
                {/* Mock Clips */}
                {track.type === 'camera' && (
                  <div className="absolute top-2 bottom-2 left-[5%] w-[90%] bg-purple-500/20 border border-purple-500/50 rounded-md flex items-center px-2 cursor-pointer hover:border-purple-400">
                    <span className="text-[10px] text-purple-300 truncate">Orbit (0s - 30s)</span>
                  </div>
                )}
                {track.type === 'video' && (
                  <div className="absolute top-2 bottom-2 left-[5%] w-[40%] bg-indigo-500/20 border border-indigo-500/50 rounded-md flex overflow-hidden cursor-pointer hover:border-indigo-400">
                    <div className="flex-1 bg-cover bg-center border-r border-indigo-500/30" style={{backgroundImage: 'url(https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=100)'}}></div>
                    <div className="flex-1 bg-cover bg-center" style={{backgroundImage: 'url(https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=100)'}}></div>
                  </div>
                )}
                {track.type === 'audio' && (
                  <div className="absolute top-2 bottom-2 left-[5%] w-[40%] bg-emerald-500/20 border border-emerald-500/50 rounded-md flex items-center justify-center cursor-pointer hover:border-emerald-400 overflow-hidden">
                    <svg className="w-full h-full opacity-50 text-emerald-500" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,50 Q10,10 20,50 T40,50 T60,50 T80,50 T100,50" stroke="currentColor" fill="none" strokeWidth="2" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { FolderTree, Image as ImageIcon, Users, Mic, Sparkles } from "lucide-react"

export function Explorer() {
  return (
    <div className="w-64 border-r border-[#27272a] bg-[#09090b] flex flex-col flex-shrink-0 h-full">
      <div className="h-14 border-b border-[#27272a] flex items-center px-4">
        <span className="font-semibold text-white text-sm">Project Media</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#27272a] text-sm text-zinc-300 cursor-pointer">
          <FolderTree className="w-4 h-4 text-zinc-500" />
          <span>Sequences</span>
        </div>
        
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#27272a] text-sm text-white cursor-pointer ml-4">
          <ImageIcon className="w-4 h-4 text-purple-400" />
          <span>Seq_01_Main</span>
        </div>

        <div className="mt-4 mb-2 px-2 text-xs font-semibold text-zinc-600 uppercase tracking-wider">ACE Engines</div>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#27272a] text-sm text-zinc-300 cursor-pointer">
          <Users className="w-4 h-4 text-indigo-400" />
          <span>Character Brain</span>
        </div>
        
        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#27272a] text-sm text-zinc-300 cursor-pointer">
          <Mic className="w-4 h-4 text-emerald-400" />
          <span>Voice Models</span>
        </div>

        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#27272a] text-sm text-zinc-300 cursor-pointer">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>FX Library</span>
        </div>

      </div>
    </div>
  )
}

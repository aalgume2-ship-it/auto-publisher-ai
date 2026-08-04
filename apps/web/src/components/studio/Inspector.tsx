"use client"

import { Settings2, Cpu, Video, Palette } from "lucide-react"

export function Inspector() {
  return (
    <div className="w-80 border-l border-[#27272a] bg-[#09090b] flex flex-col flex-shrink-0 h-full overflow-y-auto">
      <div className="h-14 border-b border-[#27272a] flex items-center px-4">
        <span className="font-semibold text-white text-sm">Properties</span>
      </div>
      
      <div className="p-4 space-y-6">
        
        {/* Core Prompt */}
        <div>
          <label className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5"><Video className="w-3 h-3"/> Scene Prompt</label>
          <textarea 
            className="w-full h-24 bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-xs text-white focus:border-purple-500 focus:outline-none resize-none"
            defaultValue="Cinematic 4K shot, realistic, shallow depth of field, neon city background."
          />
        </div>

        <div className="h-[1px] w-full bg-[#27272a]"></div>

        {/* Camera Engine Params */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5"><Cpu className="w-3 h-3"/> Camera Engine</label>
            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Pro</span>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#18181b] border border-purple-500/50 rounded flex items-center justify-center py-2 text-xs text-white bg-purple-500/5 cursor-pointer">Orbit</div>
              <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Dolly In</div>
              <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Crane</div>
              <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Static</div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Pan Z (Velocity)</span>
                <span className="text-white">1.2x</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 w-[60%] rounded-full"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[1px] w-full bg-[#27272a]"></div>

        {/* Lighting Params */}
        <div>
          <label className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5"><Palette className="w-3 h-3"/> Lighting Engine</label>
          <select className="w-full bg-[#18181b] border border-[#27272a] rounded-lg p-2 text-xs text-white focus:border-purple-500 focus:outline-none outline-none appearance-none">
            <option>Cinematic Key Light</option>
            <option>Neon Rim Light</option>
            <option>Golden Hour Soft</option>
            <option>Harsh Daylight</option>
          </select>
        </div>

      </div>
    </div>
  )
}

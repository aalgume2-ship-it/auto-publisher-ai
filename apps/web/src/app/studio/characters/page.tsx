"use client"

import { motion } from "framer-motion"
import { Search, Plus, Filter, MoreHorizontal, User, RefreshCw, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CharactersPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Character Studio</h1>
          <p className="text-zinc-400">Train, manage, and cast consistent AI identities.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="premium" className="gap-2">
            <Plus className="w-4 h-4" />
            Train New Character
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input 
            type="text" 
            placeholder="Search characters..." 
            className="w-full bg-[#18181b] border border-[#27272a] rounded-lg pl-9 pr-4 py-2 text-white focus:outline-none focus:border-purple-500"
          />
        </div>
        <Button variant="outline" className="gap-2 text-zinc-400">
          <Filter className="w-4 h-4" /> Filter
        </Button>
        <div className="flex items-center gap-2 ml-auto text-sm text-zinc-500">
          <span>Sort by:</span>
          <select className="bg-transparent text-white border-none focus:outline-none cursor-pointer">
            <option>Recently Used</option>
            <option>Newest</option>
            <option>Alphabetical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[
          { name: 'Marcus', role: 'Tech Reviewer', status: 'Ready', tags: ['Realistic', '4K', 'Casual'] },
          { name: 'Aria', role: 'News Anchor', status: 'Ready', tags: ['Studio', 'Formal'] },
          { name: 'Nova', role: 'Cyberpunk Protagonist', status: 'Training', progress: 85, tags: ['Cinematic', 'Sci-Fi'] },
          { name: 'Elena', role: 'Documentary Guide', status: 'Ready', tags: ['Warm', 'Nature'] },
          { name: 'Jin', role: 'Fitness Coach', status: 'Ready', tags: ['Action', 'Dynamic'] }
        ].map((char, i) => (
          <div key={i} className="group rounded-xl border border-[#27272a] bg-[#09090b] overflow-hidden flex flex-col cursor-pointer hover:border-purple-500/50 transition-all">
            <div className="relative aspect-[4/5] bg-zinc-800 overflow-hidden">
              {char.status === 'Training' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                  <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mb-4" />
                  <div className="text-white font-medium mb-2">Training Identity...</div>
                  <div className="w-32 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${char.progress}%` }}></div>
                  </div>
                </div>
              ) : null}
              
              <img src={`https://picsum.photos/seed/${char.name}/400/500`} alt={char.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              
              <div className="absolute top-3 right-3 flex gap-1 z-10">
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-black/50 backdrop-blur border border-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-1">
                <h3 className="font-semibold text-white">{char.name}</h3>
                {char.status === 'Ready' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] mt-1.5"></span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mb-4">{char.role}</p>
              
              <div className="flex flex-wrap gap-1.5 mt-auto">
                {char.tags.map((tag, j) => (
                  <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-zinc-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            {char.status === 'Ready' && (
              <div className="px-4 py-3 border-t border-[#27272a] bg-[#18181b] flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                  <Layers className="w-3 h-3" /> Cast in Project
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors">
                  <User className="w-3 h-3" /> Edit Styles
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

import { PreviewPlayer } from "@/components/studio/Preview"
import { Timeline } from "@/components/studio/Timeline"
import { Inspector } from "@/components/studio/Inspector"
import { Explorer } from "@/components/studio/Explorer"
import { Layers, Settings, Share, Download, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRealtimePipeline } from "@/hooks/useRealtime"
import { useStudioStore } from "@/store/studioStore"

export default function StudioLayout() {
  const runId = useStudioStore(s => s.runId)
  useRealtimePipeline(runId) // Hooks up SSE implicitly if a run is active

  return (
    <div className="flex flex-col h-screen bg-[#000000] overflow-hidden text-white font-sans antialiased">
      
      {/* Top Toolbar */}
      <header className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-4 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">
            <Layers className="w-5 h-5" />
          </Link>
          <div className="w-[1px] h-4 bg-[#27272a]"></div>
          <span className="font-medium text-white text-sm">AutoCreator Engine (ACE)</span>
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Saved</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-zinc-400">
            <Settings className="w-4 h-4" /> Config
          </Button>
          <Button variant="outline" size="sm" className="gap-2 border-[#27272a] bg-[#18181b]">
            <Wand2 className="w-4 h-4 text-purple-400" /> Prompt Compiler
          </Button>
          <Button size="sm" variant="premium" className="gap-2 shadow-purple-500/20 shadow-lg">
            <Download className="w-4 h-4" /> Export 4K
          </Button>
        </div>
      </header>

      {/* Main 3-Column Area */}
      <div className="flex-1 flex overflow-hidden">
        <Explorer />
        <PreviewPlayer />
        <Inspector />
      </div>

      {/* Bottom Timeline */}
      <Timeline />

    </div>
  )
}

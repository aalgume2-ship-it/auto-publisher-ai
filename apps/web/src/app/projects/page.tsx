"use client"

import { Film } from "lucide-react"

export default function ProjectsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <Film className="w-8 h-8 text-purple-400" />
        <h1 className="text-3xl font-bold text-white tracking-tight">Projects (Figma Style)</h1>
      </div>
      <div className="border border-[#27272a] bg-[#09090b] rounded-xl p-6 text-center text-zinc-400">
        Workspace Projects Mockup
      </div>
    </div>
  )
}

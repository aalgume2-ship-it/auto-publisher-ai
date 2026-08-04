"use client"

import { BarChart3 } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <BarChart3 className="w-8 h-8 text-purple-400" />
        <h1 className="text-3xl font-bold text-white tracking-tight">AI Analytics</h1>
      </div>
      <div className="border border-[#27272a] bg-[#09090b] rounded-xl p-6 text-center text-zinc-400">
        Analytics Engine Mockup (Connects to ClickHouse / OpenSearch)
      </div>
    </div>
  )
}

"use client"

import { Plus, Play, MoreHorizontal, Workflow, Link as LinkIcon, Zap, Clock, FileVideo, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function WorkflowsPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Workflow Engine</h1>
          <p className="text-zinc-400">Node-based automation for your content factory.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Globe className="w-4 h-4" /> Browse Templates
          </Button>
          <Button variant="premium" className="gap-2">
            <Plus className="w-4 h-4" />
            Create Workflow
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { 
            name: 'Daily Tech News Pipeline', 
            status: 'active', 
            nodes: ['Schedule', 'News API', 'Script AI', 'Video Gen', 'YouTube Publish'],
            runs: 142,
            lastRun: '2 hours ago'
          },
          { 
            name: 'Viral Shorts Repurposer', 
            status: 'active', 
            nodes: ['Webhook', 'Audio Extract', 'Subtitles', 'Render', 'TikTok Publish'],
            runs: 854,
            lastRun: '15 mins ago'
          },
          { 
            name: 'Weekly Newsletter Teaser', 
            status: 'paused', 
            nodes: ['Schedule', 'Gmail Fetch', 'Summary AI', 'Video Gen', 'LinkedIn'],
            runs: 12,
            lastRun: '3 days ago'
          }
        ].map((wf, i) => (
          <div key={i} className="border border-[#27272a] bg-[#09090b] rounded-xl p-5 hover:border-purple-500/30 transition-all flex flex-col group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${wf.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                  <Workflow className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-white leading-tight">{wf.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${wf.status === 'active' ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'bg-zinc-500'}`}></span>
                    <span className="text-zinc-500 capitalize">{wf.status}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex-1">
              <div className="text-xs text-zinc-500 mb-2">Pipeline nodes</div>
              <div className="flex flex-wrap gap-1.5">
                {wf.nodes.map((node, j) => (
                  <div key={j} className="flex items-center gap-1">
                    <span className="text-[10px] px-2 py-1 rounded bg-[#18181b] border border-[#27272a] text-zinc-300">
                      {node}
                    </span>
                    {j < wf.nodes.length - 1 && <LinkIcon className="w-3 h-3 text-zinc-600" />}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-[#27272a] flex items-center justify-between text-xs">
              <div className="flex items-center gap-4 text-zinc-500">
                <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> {wf.runs} runs</span>
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {wf.lastRun}</span>
              </div>
              {wf.status === 'active' ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">Pause</Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">Activate</Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

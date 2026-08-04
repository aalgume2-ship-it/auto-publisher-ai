"use client"

import { useState } from "react"
import { Play, Pause, SkipBack, SkipForward, Maximize2, Layers, Type, Music, Settings, Download, Share, Plus, Scissors } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function EditorPage() {
  const [isPlaying, setIsPlaying] = useState(false)

  return (
    <div className="flex flex-col h-screen bg-[#000000] overflow-hidden">
      {/* Navbar */}
      <header className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-zinc-400 hover:text-white transition-colors">
            <Layers className="w-5 h-5" />
          </Link>
          <div className="w-[1px] h-4 bg-[#27272a]"></div>
          <span className="font-medium text-white text-sm">Cinematic History of Rome</span>
          <span className="text-xs text-zinc-500 bg-[#27272a] px-2 py-0.5 rounded">Auto-Saved</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2 text-zinc-400">
            <Settings className="w-4 h-4" /> Settings
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Share className="w-4 h-4" /> Share
          </Button>
          <Button size="sm" variant="premium" className="gap-2">
            <Download className="w-4 h-4" /> Export 4K
          </Button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Tools */}
        <div className="w-16 border-r border-[#27272a] bg-[#09090b] flex flex-col items-center py-4 gap-4 flex-shrink-0">
          <ToolIcon icon={Layers} active tooltip="Media" />
          <ToolIcon icon={Type} tooltip="Subtitles" />
          <ToolIcon icon={Music} tooltip="Audio" />
          <ToolIcon icon={Scissors} tooltip="Transitions" />
          <div className="w-8 h-[1px] bg-[#27272a] my-2"></div>
          <ToolIcon icon={Plus} tooltip="Add Scene" />
        </div>

        {/* Center - Canvas & Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Canvas Area */}
          <div className="flex-1 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-[#000000] opacity-90 p-4 flex flex-col">
            <div className="flex-1 border border-[#27272a] rounded-xl bg-black overflow-hidden relative flex items-center justify-center group shadow-2xl">
              {/* Mock Video Frame */}
              <img src="https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=1200&q=80" alt="Video Frame" className="w-full h-full object-cover" />
              
              {/* Overlays / Subtitles */}
              <div className="absolute bottom-10 w-full flex justify-center z-20">
                <div className="bg-black/60 backdrop-blur-md px-6 py-2 rounded-lg border border-white/10 text-white font-medium text-lg">
                  "Rome wasn't built in a day, but it fell in one."
                </div>
              </div>

              {/* Player Controls overlay on hover */}
              <div className="absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-black/50 backdrop-blur border-white/10 text-white hover:bg-black/70">
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="h-14 flex items-center justify-center gap-4 mt-2">
              <span className="text-xs font-mono text-zinc-400">00:04:12</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white"><SkipBack className="w-4 h-4" /></Button>
                <Button variant="secondary" size="icon" className="rounded-full bg-white text-black hover:bg-zinc-200" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" fill="currentColor" />}
                </Button>
                <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white"><SkipForward className="w-4 h-4" /></Button>
              </div>
              <span className="text-xs font-mono text-zinc-600">00:10:00</span>
            </div>
          </div>

          {/* Timeline Area */}
          <div className="h-64 border-t border-[#27272a] bg-[#09090b] flex flex-col flex-shrink-0">
            {/* Timeline Header */}
            <div className="h-8 border-b border-[#27272a] flex items-center px-4 bg-[#18181b]">
              <div className="text-xs font-medium text-zinc-400 w-48">Tracks</div>
              {/* Ruler */}
              <div className="flex-1 flex overflow-hidden opacity-50">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="flex-1 border-l border-zinc-700 h-2 mt-auto relative">
                    {i % 5 === 0 && <span className="absolute -top-4 -left-2 text-[10px] text-zinc-500 font-mono">00:0{i}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Tracks */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
              
              {/* Video Track */}
              <div className="flex h-16 group">
                <div className="w-48 flex items-center px-2 border-r border-[#27272a]">
                  <span className="text-xs text-zinc-400 flex items-center gap-2"><Film className="w-3 h-3" /> V1 Main</span>
                </div>
                <div className="flex-1 relative flex items-center p-1">
                  <div className="absolute h-full w-[40%] left-0 bg-indigo-500/20 border border-indigo-500/50 rounded flex overflow-hidden cursor-pointer hover:border-indigo-400">
                    {/* Scene thumbnails mock */}
                    <div className="flex-1 bg-cover bg-center border-r border-indigo-500/30" style={{backgroundImage: 'url(https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=100)'}}></div>
                    <div className="flex-1 bg-cover bg-center" style={{backgroundImage: 'url(https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=100)'}}></div>
                  </div>
                  <div className="absolute h-full w-[30%] left-[41%] bg-purple-500/20 border border-purple-500/50 rounded cursor-pointer hover:border-purple-400 flex items-center justify-center">
                    <span className="text-[10px] text-purple-300">Generating...</span>
                  </div>
                </div>
              </div>

              {/* Audio Track */}
              <div className="flex h-12 group">
                <div className="w-48 flex items-center px-2 border-r border-[#27272a]">
                  <span className="text-xs text-zinc-400 flex items-center gap-2"><Mic className="w-3 h-3" /> A1 Voice</span>
                </div>
                <div className="flex-1 relative flex items-center p-1">
                  <div className="absolute h-full w-[38%] left-[1%] bg-emerald-500/20 border border-emerald-500/50 rounded flex items-center justify-center cursor-pointer hover:border-emerald-400">
                    <svg className="w-full h-full opacity-50 text-emerald-500" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,50 Q10,10 20,50 T40,50 T60,50 T80,50 T100,50" stroke="currentColor" fill="none" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Subtitle Track */}
              <div className="flex h-8 group">
                <div className="w-48 flex items-center px-2 border-r border-[#27272a]">
                  <span className="text-xs text-zinc-400 flex items-center gap-2"><Type className="w-3 h-3" /> S1 Text</span>
                </div>
                <div className="flex-1 relative flex items-center p-1">
                  <div className="absolute h-full w-[15%] left-[5%] bg-amber-500/20 border border-amber-500/50 rounded flex items-center px-2 cursor-pointer hover:border-amber-400 truncate">
                    <span className="text-[10px] text-amber-300 truncate">"Rome wasn't built..."</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-72 border-l border-[#27272a] bg-[#09090b] flex flex-col flex-shrink-0">
          <div className="h-14 border-b border-[#27272a] flex items-center px-4">
            <span className="font-semibold text-white text-sm">Clip Properties</span>
          </div>
          <div className="p-4 space-y-6 overflow-y-auto flex-1">
            
            {/* Prompt Editor */}
            <div>
              <label className="text-xs font-medium text-zinc-400 mb-2 block">Prompt</label>
              <textarea 
                className="w-full h-24 bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-xs text-white focus:border-purple-500 focus:outline-none resize-none"
                defaultValue="Drone shot, 4K, realistic, orbit around the Colosseum during golden hour, epic lighting."
              />
              <Button size="sm" variant="secondary" className="w-full mt-2 text-xs">Regenerate Clip</Button>
            </div>

            <div className="h-[1px] w-full bg-[#27272a]"></div>

            {/* Camera Controls */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-zinc-400">Camera Engine</label>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">Pro</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-white border-purple-500/50 bg-purple-500/5 cursor-pointer">Orbit</div>
                <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Drone FPV</div>
                <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Dolly In</div>
                <div className="bg-[#18181b] border border-[#27272a] rounded flex items-center justify-center py-2 text-xs text-zinc-400 hover:text-white cursor-pointer">Static</div>
              </div>
            </div>

            {/* Intensity Slider Mock */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-zinc-400">Motion Intensity</label>
                <span className="text-[10px] text-zinc-500">75%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-white w-[75%] rounded-full"></div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}

function ToolIcon({ icon: Icon, active, tooltip }: any) {
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${active ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-[#27272a]'}`} title={tooltip}>
      <Icon className="w-5 h-5" />
    </div>
  )
}

function Film(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7h4"/><path d="M3 12h18"/><path d="M3 17h4"/><path d="M17 3v18"/><path d="M17 7h4"/><path d="M17 17h4"/></svg> }
function Mic(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> }

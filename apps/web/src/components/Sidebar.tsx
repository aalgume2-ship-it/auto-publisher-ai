"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Film, 
  Users, 
  Mic, 
  Palette, 
  Share2, 
  BarChart3, 
  Settings,
  Plus,
  PlaySquare,
  Workflow
} from "lucide-react"

const sidebarItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: Film },
  { name: "Character Studio", href: "/studio/characters", icon: Users },
  { name: "Voice Studio", href: "/studio/voices", icon: Mic },
  { name: "Style Studio", href: "/studio/styles", icon: Palette },
  { name: "Auto Publish", href: "/auto-publish", icon: Share2 },
  { name: "Workflows", href: "/workflows", icon: Workflow },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 border-r border-[#27272a] bg-[#09090b] h-screen flex flex-col pt-6 fixed left-0 top-0">
      <div className="px-6 mb-8 flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <PlaySquare className="w-4 h-4 text-white fill-white" />
        </div>
        <span className="font-bold text-white text-lg tracking-tight">AutoCreator</span>
      </div>

      <div className="px-4 pb-4">
        <Link href="/create">
          <button className="w-full bg-white text-black hover:bg-gray-200 h-10 rounded-lg flex items-center justify-center gap-2 font-medium transition-all active:scale-95 shadow-sm">
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </Link>
      </div>

      <div className="flex-1 px-3 py-2 flex flex-col gap-1 overflow-y-auto">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-3 mt-4">Workspace</div>
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-[#27272a] text-white" 
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-4 h-4", isActive ? "text-purple-400" : "")} />
                {item.name}
              </div>
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-[#27272a]">
        <Link href="/settings">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </div>
        </Link>
        
        {/* User profile mock */}
        <div className="mt-4 flex items-center gap-3 px-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-500 border border-zinc-600" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white">Enterprise Admin</span>
            <span className="text-xs text-zinc-500">Pro Plan</span>
          </div>
        </div>
      </div>
    </div>
  )
}

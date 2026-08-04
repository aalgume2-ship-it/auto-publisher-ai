import { Sidebar } from "@/components/Sidebar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[#000000]">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen border-l border-white/5 bg-[#000000]">
        {children}
      </main>
    </div>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, ArrowUpRight, Command, Layers3, LayoutGrid, Plus, Settings2, Workflow } from "lucide-react"

const nav = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/requests", label: "Request processing", icon: Layers3 },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/automations", label: "Automation builder", icon: Workflow },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings2 },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = nav.find(item => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href + "/")))
  return <div className="shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Command size={15} /></span>AutomationPilot</Link>
      <div className="nav-wrap">
        <p className="nav-label">Workspace</p>
        <nav aria-label="Workspace">
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href}
            aria-current={current?.href === href ? "page" : undefined}><Icon size={17} />{label}</Link>)}
        </nav>
      </div>
      <Link className="local-card" href="/settings">
        <span className="local-mark"><Layers3 size={16} /></span>
        <span><strong>Local workspace</strong><small>On this device</small></span>
        <ArrowUpRight size={13} />
      </Link>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <span>Workspace <span className="slash">/</span> <strong>{current?.label ?? "AutomationPilot"}</strong></span>
        <Link className="button primary" href="/requests"><Plus size={16} /> New request</Link>
      </header>
      <main className="main" id="main-content">{children}</main>
    </div>
  </div>
}

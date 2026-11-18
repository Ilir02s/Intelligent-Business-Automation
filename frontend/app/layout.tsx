import type { Metadata } from "next"
import { Shell } from "@/components/layout/shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "AutomationPilot — Intelligent Business Automation",
  description: "Local-first business request triage and workflow approvals.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><Shell>{children}</Shell></body></html>
}

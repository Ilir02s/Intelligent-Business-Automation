"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Activity, ArrowRight, CheckCheck, Clock3, Inbox, Timer } from "lucide-react"
import { ActivityChart } from "@/components/dashboard/activity-chart"
import { ExecutionTable } from "@/components/dashboard/execution-table"
import { Feedback } from "@/components/ui/feedback"
import type { Dashboard } from "@/lib/api"
import { useApi } from "@/lib/use-api"

export default function Home() {
  const [days, setDays] = useState(7)
  const { data, error, reload } = useApi<Dashboard>(`/dashboard?days=${days}`)
  const [snapshot, setSnapshot] = useState<{ data: Dashboard; days: number }>()
  useEffect(() => {
    if (data) setSnapshot({ data, days })
  }, [data, days])
  const displayed = data ? { data, days } : snapshot
  const reduce = useReducedMotion()
  const stats = [
    { label: "Processed requests", value: displayed?.data.total, caption: "All requests analyzed", Icon: Inbox },
    { label: "Pending approvals", value: displayed?.data.pending, caption: "Awaiting human review", Icon: Clock3 },
    { label: "Completed workflows", value: displayed?.data.completed, caption: "Routing and approval complete", Icon: CheckCheck },
    { label: "Average processing time", value: displayed && `${displayed.data.average_ms} ms`, caption: "Across analyzed requests", Icon: Timer },
  ]
  return <>
    <div className="page-heading"><h1>Overview</h1><p>Monitor request intake, workflow executions, and approvals.</p></div>
    <div className="stats-grid">{stats.map(({ label, value, caption, Icon }, index) =>
      <motion.section key={label} className="panel stat" initial={reduce ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: index * 0.04 }}>
        <div className="stat-top"><span>{label}</span><span className="tile"><Icon size={17} /></span></div>
        <strong className="stat-value">{value ?? "—"}</strong><small>{caption}</small>
      </motion.section>)}</div>
    <section className="analytics" aria-labelledby="activity-heading" aria-busy={!data && !error}>
      <div className="analytics-heading"><h2 id="activity-heading"><Activity size={17} /> Request activity</h2>
        {displayed && !data && !error && <span role="status">Updating range…</span>}
      </div>
      {displayed && <ActivityChart data={displayed.data.activity} days={displayed.days} onChange={setDays} />}
      {(error || !displayed) && <Feedback error={error} retry={reload} />}
    </section>
    <section className="panel">
      <div className="panel-head"><div><h2>Recent executions</h2><p>Latest workflows across your workspace.</p></div>
        <Link className="button" href="/workflows">View workflows <ArrowRight size={15} /></Link>
      </div>
      {displayed && <ExecutionTable items={displayed.data.recent} />}
    </section>
  </>
}

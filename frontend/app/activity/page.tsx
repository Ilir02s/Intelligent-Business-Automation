"use client"

import { useState } from "react"
import Link from "next/link"
import { Activity as ActivityIcon } from "lucide-react"
import { Feedback } from "@/components/ui/feedback"
import { Button } from "@/components/ui/button"
import { dateTime, executionRef, type AuditEvent } from "@/lib/api"
import { useApi } from "@/lib/use-api"

export default function Activity() {
  const [page, setPage] = useState(0)
  const { data, error, reload } = useApi<AuditEvent[]>(`/activity?offset=${page * 20}&limit=21`)
  return <>
    <div className="page-heading"><h1>Activity</h1><p>Trace request processing and human decisions in the audit log.</p></div>
    <section className="panel">
      <div className="panel-head"><h2>Audit log</h2></div>
      {!data ? <Feedback error={error} retry={reload} /> : data.length ? <ul className="audit">
        {data.slice(0, 20).map(item => <li key={item.id}>
          <span className="tile"><ActivityIcon size={16} /></span>
          <div><strong className="event-type">{item.event.replaceAll("_", " ")}</strong>
            <p>{item.detail}</p>
            <Link href={`/workflows/${item.execution.id}`}>{executionRef(item.execution.id)} · {item.execution.analysis.category}{item.execution.demo && " · Demo"}</Link>
          </div>
          <time dateTime={item.created_at}>{dateTime(item.created_at)}</time>
        </li>)}
      </ul> : <div className="empty">No audit events yet.</div>}
      {(page > 0 || (data?.length ?? 0) > 20) && <div className="pagination">
        <Button disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page + 1}</span>
        <Button disabled={(data?.length ?? 0) <= 20} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </section>
  </>
}

"use client"

import { useParams } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ExecutionDetail } from "@/components/dashboard/execution-detail"
import { Button } from "@/components/ui/button"
import { Feedback } from "@/components/ui/feedback"
import { api, executionRef, type Execution } from "@/lib/api"
import { useApi } from "@/lib/use-api"

export default function Workflow() {
  const { id } = useParams<{ id: string }>()
  const { data, error, reload } = useApi<Execution>(`/workflows/${encodeURIComponent(id)}`)
  const [updated, setUpdated] = useState<Execution>()
  const [failure, setFailure] = useState<string>()
  const [saving, setSaving] = useState(false)
  const item = updated?.id === Number(id) ? updated : data

  async function decide(decision: "approve" | "reject") {
    if (saving) return
    setSaving(true)
    setFailure(undefined)
    try { setUpdated(await api<Execution>(`/workflows/${encodeURIComponent(id)}/decision`, undefined, { decision })) }
    catch (error) { setFailure((error as Error).message); reload() }
    finally { setSaving(false) }
  }

  return <>
    <Link className="back-link" href="/workflows"><ArrowLeft size={16} /> All workflows</Link>
    <div className="page-heading"><h1>{item?.name ?? "Workflow details"}</h1>
      {item && <p>{executionRef(item.id)}{item.demo && " · Demo execution"}</p>}
    </div>
    {failure && <Feedback error={failure} />}
    {item ? <ExecutionDetail item={item} /> : <Feedback error={error} retry={reload} />}
    {item?.status === "pending_approval" && <section className="panel detail approval" aria-busy={saving}>
      <div><h2>Human approval required</h2><p>Approval makes the internal follow-up step ready for an operator.</p></div>
      <div className="actions">
        <Button disabled={saving} onClick={() => decide("reject")}>Reject</Button>
        <Button className="primary" disabled={saving} onClick={() => decide("approve")}>Approve workflow</Button>
      </div>
    </section>}
  </>
}

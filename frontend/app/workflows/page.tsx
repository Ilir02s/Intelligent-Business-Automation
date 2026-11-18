"use client"

import { useState } from "react"
import { ExecutionTable } from "@/components/dashboard/execution-table"
import { Feedback } from "@/components/ui/feedback"
import { Button } from "@/components/ui/button"
import { useApi } from "@/lib/use-api"
import type { Execution } from "@/lib/api"

export default function Workflows() {
  const [page, setPage] = useState(0)
  const { data, error, reload } = useApi<Execution[]>(`/workflows?offset=${page * 20}&limit=21`)
  return <>
    <div className="page-heading"><h1>Workflows</h1><p>Review routed requests, inspect steps, and record approval decisions.</p></div>
    <section className="panel">
      <div className="panel-head"><h2>Executions</h2></div>
      {data ? <ExecutionTable items={data.slice(0, 20)} /> : <Feedback error={error} retry={reload} />}
      {(page > 0 || (data?.length ?? 0) > 20) && <div className="pagination">
        <Button disabled={!page} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page + 1}</span>
        <Button disabled={(data?.length ?? 0) <= 20} onClick={() => setPage(page + 1)}>Next</Button>
      </div>}
    </section>
  </>
}

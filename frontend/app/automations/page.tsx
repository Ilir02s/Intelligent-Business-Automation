"use client"

import Link from "next/link"
import { useState, type PointerEvent } from "react"
import { api } from "@/lib/api"
import { useApi } from "@/lib/use-api"
import { Button } from "@/components/ui/button"
import "./automation.css"

const kinds = ["trigger", "classify", "condition", "approval", "assign", "task", "notify", "end"] as const
type Kind = typeof kinds[number]
type Node = { id: string; kind: Kind; label: string; x: number; y: number; next: string; alternate: string; field: string; operator: string; value: string }
type Graph = { name: string; nodes: Node[] }
type Automation = { id: number; draft: Graph; version: number }
type Version = { id: number; number: number; graph: Graph }
type Trace = { id: string; status: string; detail: string; target?: string }
type Result = { status: string; trace: Trace[] }
type Run = Result & { id: number; version_id: number; revision: number; text: string }
type Item = { id: number; run_id: number; kind: string; title: string; owner: string; done: boolean }

function node(id: string, kind: Kind, label: string, x: number, y: number, next = "", extra: Partial<Node> = {}): Node {
  return { id, kind, label, x, y, next, alternate: "", field: "category", operator: "equals", value: "", ...extra }
}

const templates: Record<string, Graph> = {
  "Refund routing": { name: "Refund routing", nodes: [
    node("start", "trigger", "Request received", 250, 24, "classify"),
    node("classify", "classify", "Classify request", 250, 118, "condition"),
    node("condition", "condition", "Amount over 100?", 250, 212, "finance", { alternate: "operations", field: "amount", operator: "greater_than", value: "100" }),
    node("finance", "assign", "Assign Finance", 24, 330, "task", { value: "Finance" }),
    node("operations", "assign", "Assign Operations", 470, 330, "task", { value: "Operations" }),
    node("task", "task", "Create review task", 250, 440, "end", { value: "Review {{reference}}" }),
    node("end", "end", "Routing finished", 250, 534),
  ] },
  "IT incident triage": { name: "IT incident triage", nodes: [
    node("start", "trigger", "Request received", 250, 24, "classify"),
    node("classify", "classify", "Classify request", 250, 118, "urgent"),
    node("urgent", "condition", "Critical incident?", 250, 212, "alert", { alternate: "task", field: "priority", value: "Critical" }),
    node("alert", "notify", "Flag incident in local inbox", 24, 330, "task"),
    node("task", "task", "Create investigation task", 470, 330, "end"),
    node("end", "end", "Routing finished", 250, 440),
  ] },
}

const hasAlternate = (step: Node) => step.kind === "condition" || step.kind === "approval"

function destinations(step: Node) {
  if (step.kind === "end") return []
  return hasAlternate(step) ? [step.next, step.alternate] : [step.next]
}

function coordinate(value: number) {
  return Math.min(10000, Math.max(0, Math.round(value)))
}

export default function Automations() {
  const catalog = useApi<Automation[]>("/automations")
  const items = useApi<Item[]>("/automation-work-items")
  const [id, setId] = useState<number>()
  const [version, setVersion] = useState(0)
  const [graph, setGraph] = useState<Graph>(templates["Refund routing"])
  const [selected, setSelected] = useState("condition")
  const [past, setPast] = useState<Graph[]>([])
  const [future, setFuture] = useState<Graph[]>([])
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; before: Graph }>()
  const [sample, setSample] = useState("Please review $180 for invoice INV-2048.")
  const [simulate, setSimulate] = useState("")
  const [preview, setPreview] = useState<Result & { graph: Graph; sample: string; simulate: string }>()
  const [run, setRun] = useState<Run>()
  const [reason, setReason] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [kind, setKind] = useState<Kind>("task")
  const [versions, setVersions] = useState<Version[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runFilter, setRunFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [traceNode, setTraceNode] = useState("")
  const [batch, setBatch] = useState<{ row: number; run?: Run; error?: string }[]>([])
  const current = graph.nodes.find(step => step.id === selected)
  const runGraph = versions.find(entry => entry.id === run?.version_id)?.graph
  const canvasGraph = runGraph ?? graph
  const currentPreview = preview?.graph === graph && preview.sample === sample && preview.simulate === simulate
    ? preview
    : undefined
  const trace = run?.trace ?? currentPreview?.trace ?? []
  const width = Math.max(700, ...canvasGraph.nodes.map(step => step.x + 220))
  const height = Math.max(400, ...canvasGraph.nodes.map(step => step.y + 85))

  function change(next: Graph) {
    setPast(history => [...history.slice(-49), graph])
    setFuture([])
    setGraph(next)
    setPreview(undefined)
  }

  function edit(step: Partial<Node>) {
    change({ ...graph, nodes: graph.nodes.map(item => item.id === selected ? { ...item, ...step } : item) })
  }

  function add() {
    const key = crypto.randomUUID()
    change({ ...graph, nodes: [...graph.nodes, node(key, kind, kind, 24, Math.min(10000, height))] })
    setSelected(key)
  }

  function duplicate() {
    if (!current) return
    const key = crypto.randomUUID()
    change({ ...graph, nodes: [...graph.nodes, {
      ...current, id: key, x: Math.min(10000, current.x + 32), y: Math.min(10000, current.y + 72),
    }] })
    setSelected(key)
  }

  function arrange() {
    const rows = new Map<string, number>()
    const byId = new Map(graph.nodes.map(step => [step.id, step]))
    const incoming = new Map(graph.nodes.map(step => [step.id, 0]))
    const targets = (step: Node) => destinations(step).filter(key => byId.has(key))
    for (const step of graph.nodes) {
      for (const target of targets(step)) incoming.set(target, (incoming.get(target) ?? 0) + 1)
    }
    const queue = graph.nodes.filter(step => incoming.get(step.id) === 0)
    for (const step of queue) {
      for (const target of targets(step)) {
        rows.set(target, Math.max(rows.get(target) ?? 0, (rows.get(step.id) ?? 0) + 1))
        const remaining = (incoming.get(target) ?? 1) - 1
        incoming.set(target, remaining)
        if (!remaining) queue.push(byId.get(target)!)
      }
    }
    const columns = new Map<number, number>()
    change({ ...graph, nodes: graph.nodes.map(step => {
      const row = rows.get(step.id) ?? 0
      const column = columns.get(row) ?? 0
      columns.set(row, column + 1)
      return { ...step, x: 24 + (column % 40) * 225, y: Math.min(10000, 24 + row * 96 + Math.floor(column / 40) * 72) }
    }) })
  }

  function remove() {
    change({ ...graph, nodes: graph.nodes.filter(step => step.id !== selected).map(step => ({
      ...step, next: step.next === selected ? "" : step.next, alternate: step.alternate === selected ? "" : step.alternate,
    })) })
    setSelected("")
  }

  function move(event: PointerEvent<HTMLButtonElement>, step: Node) {
    if (!drag || drag.id !== step.id) return
    const original = drag.before.nodes.find(item => item.id === step.id)
    if (!original) return
    setGraph(previous => ({ ...previous, nodes: previous.nodes.map(item => item.id !== step.id ? item : {
      ...item, x: coordinate(original.x + (event.clientX - drag.x) * 100 / zoom),
      y: coordinate(original.y + (event.clientY - drag.y) * 100 / zoom),
    }) }))
  }

  function release() {
    if (!drag) return
    if (drag.before !== graph) {
      setPast(previous => [...previous.slice(-49), drag.before])
      setFuture([])
      setPreview(undefined)
    }
    setDrag(undefined)
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setNotice("")
    setError("")
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The operation failed.")
    } finally {
      setBusy(false)
    }
  }

  async function load(key: number) {
    const [history, published] = await Promise.all([
      api<Run[]>(`/automations/${key}/runs`),
      api<Version[]>(`/automations/${key}/versions`),
    ])
    setRuns(history)
    setVersions(published)
  }

  function open(entry?: Automation) {
    setId(entry?.id)
    setVersion(entry?.version ?? 0)
    setGraph(entry?.draft ?? templates["Refund routing"])
    setSelected("")
    setRun(undefined)
    setPreview(undefined)
    setRuns([])
    setBatch([])
    setVersions([])
    setPast([])
    setFuture([])
    return entry ? load(entry.id) : Promise.resolve()
  }

  async function save() {
    const entry = await api<Automation>(id ? `/automations/${id}/draft` : "/automations", undefined, graph)
    setId(entry.id)
    setVersion(entry.version)
    catalog.reload()
    return entry
  }

  function showRun(next: Run) {
    setRun(next)
    setPreview(undefined)
    setTraceNode("")
    setReason("")
    items.reload()
  }

  return <>
    <div className="page-heading"><h1>Automation builder</h1><p>Design, test, and run request workflows locally.</p></div>
    <div className="automation-controls">
      <label>Workflow <select value={id ?? ""} disabled={busy} onChange={event => {
        const entry = catalog.data?.find(item => item.id === Number(event.target.value))
        void perform(() => open(entry))
      }}>
        <option value="">New workflow</option>
        {catalog.data?.map(entry => <option key={entry.id} value={entry.id}>{entry.draft.name}</option>)}
      </select></label>
      <Button onClick={() => perform(() => open())} disabled={busy}>New workflow</Button>
      <label>Template <select value="" disabled={busy} onChange={event => { change(templates[event.target.value]); setRun(undefined) }}>
        <option value="" disabled>Choose a template</option>
        {Object.keys(templates).map(name => <option key={name}>{name}</option>)}
      </select></label>
      <Button disabled={busy || !!run} onClick={() => perform(async () => { await save(); setNotice("Draft saved.") })}>Save draft</Button>
      <Button disabled={busy || !!run} onClick={() => perform(async () => {
        const entry = await save()
        const published = await api<Automation>(`/automations/${entry.id}/publish`, undefined, {})
        setVersion(published.version)
        await load(entry.id)
        catalog.reload()
        setNotice(`Published version ${published.version}.`)
      })}>Publish</Button>
      <Button disabled={!!run} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" }))
        const link = document.createElement("a")
        link.href = url
        link.download = "workflow.json"
        link.click()
        URL.revokeObjectURL(url)
      }}>Export JSON</Button>
      <label>Import JSON <input type="file" accept="application/json,.json" disabled={busy || !!run} onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ""
        if (file) void perform(async () => {
          const imported: Graph = JSON.parse(await file.text())
          const entry = await api<Automation>("/automations", undefined, imported)
          await open(entry)
          catalog.reload()
        })
      }} /></label>
    </div>
    {(error || catalog.error || items.error) && <p role="alert">{error || catalog.error || items.error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="automation-builder">
      <section className="panel">
        <div className="automation-controls automation-toolbar">
          {run ? <><strong>Run #{run.id} · Version {versions.find(entry => entry.id === run.version_id)?.number}</strong>
            <Button onClick={() => setRun(undefined)}>Back to editor</Button></> : <>
            <label>Workflow name <input value={graph.name} maxLength={120} onChange={event => change({ ...graph, name: event.target.value })} /></label>
            <label>Node type <select value={kind} onChange={event => setKind(event.target.value as Kind)}>
              {kinds.map(value => <option key={value}>{value}</option>)}
            </select></label>
            <Button disabled={graph.nodes.length >= 100} onClick={add}>Add node</Button>
            <Button onClick={arrange}>Auto-layout</Button>
            <Button disabled={!past.length} onClick={() => {
              setFuture([graph, ...future]); setGraph(past[past.length - 1]); setPast(past.slice(0, -1)); setPreview(undefined)
            }}>Undo</Button>
            <Button disabled={!future.length} onClick={() => {
              setPast([...past, graph]); setGraph(future[0]); setFuture(future.slice(1)); setPreview(undefined)
            }}>Redo</Button>
          </>}
          <label>Zoom <input type="range" min="50" max="125" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
        </div>
        <div className="automation-viewport">
          <div style={{ width: width * zoom / 100, height: height * zoom / 100 }}>
            <div className="automation-canvas" style={{ width, height, transform: `scale(${zoom / 100})` }}>
              <svg className="automation-edges" width={width} height={height} aria-hidden="true">
                {canvasGraph.nodes.flatMap(step => destinations(step).map((target, index) => {
                  const destination = canvasGraph.nodes.find(item => item.id === target)
                  if (!destination) return null
                  const x = step.x + 96
                  const y = step.y + 58
                  const endX = destination.x + 96
                  const endY = destination.y
                  const mid = (y + endY) / 2 + (index ? 10 : 0)
                  const active = trace.some(entry => entry.id === step.id && entry.target === target)
                  return <g key={`${step.id}-${index}`} className={active ? "taken" : undefined}>
                    <path d={`M ${x} ${y} V ${mid} H ${endX} V ${endY}`} />
                    {hasAlternate(step) && <text x={(x + endX) / 2} y={mid - 5}>
                      {step.kind === "approval" ? (index ? "Rejected" : "Approved") : (index ? "Otherwise" : "Match")}
                    </text>}
                  </g>
                }))}
              </svg>
              {canvasGraph.nodes.map(step => {
                const entry = trace.findLast(event => event.id === step.id)
                return <button type="button" key={step.id} className="automation-node" data-status={entry?.status}
                  aria-pressed={run ? traceNode === step.id : selected === step.id}
                  style={{ left: step.x, top: step.y }}
                  onClick={() => run ? setTraceNode(step.id) : setSelected(step.id)}
                  onPointerDown={event => {
                    if (run || event.button !== 0) return
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setSelected(step.id)
                    setDrag({ id: step.id, x: event.clientX, y: event.clientY, before: graph })
                  }}
                  onPointerMove={event => move(event, step)}
                  onPointerUp={release} onPointerCancel={release}>
                  <small>{step.kind}{entry ? ` · ${entry.status}` : ""}</small><strong>{step.label}</strong>
                </button>
              })}
            </div>
          </div>
        </div>
      </section>
      <aside className="panel automation-inspector">
        {run ? <>
          <h2>Run #{run.id}</h2><p>{run.status.replaceAll("_", " ")}</p><p>{run.text}</p>
          {run.status === "pending_approval" && <>
            <label>Decision reason <input value={reason} maxLength={8000} onChange={event => setReason(event.target.value)} /></label>
            <div className="automation-controls">{(["approve", "reject"] as const).map(decision => <Button key={decision}
              disabled={busy || !reason.trim()} onClick={() => perform(async () => {
                const updated = await api<Run>(`/automation-runs/${run.id}/decision`, undefined, { decision, text: reason, revision: run.revision })
                showRun(updated)
                await load(id!)
              })}>{decision === "approve" ? "Approve" : "Reject"}</Button>)}</div>
          </>}
        </> : current ? <>
          <h2>Node settings</h2>
          <label>Label <input value={current.label} maxLength={120} onChange={event => edit({ label: event.target.value })} /></label>
          {current.kind !== "end" && <label>{current.kind === "approval" ? "Approved" : current.kind === "condition" ? "Match" : "Next node"}
            <select value={current.next} onChange={event => edit({ next: event.target.value })}>
              <option value="">Choose a destination</option>
              {graph.nodes.filter(step => step.id !== current.id && step.kind !== "trigger").map(step => <option value={step.id} key={step.id}>{step.label}</option>)}
            </select>
          </label>}
          {hasAlternate(current) && <label>{current.kind === "approval" ? "Rejected" : "Otherwise"}
            <select value={current.alternate} onChange={event => edit({ alternate: event.target.value })}>
              <option value="">Choose a destination</option>
              {graph.nodes.filter(step => step.id !== current.id && step.kind !== "trigger").map(step => <option value={step.id} key={step.id}>{step.label}</option>)}
            </select>
          </label>}
          {current.kind === "condition" && <>
            <label>Field <select value={current.field} onChange={event => edit({ field: event.target.value })}>
              {["category", "priority", "text", "amount", "reference", "email", "date"].map(field => <option key={field}>{field}</option>)}
            </select></label>
            <label>Operator <select value={current.operator} onChange={event => edit({ operator: event.target.value })}>
              {["equals", "contains", "greater_than", "exists"].map(operator => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}
            </select></label>
          </>}
          {(["condition", "approval", "assign", "task", "notify"].includes(current.kind) && !(current.kind === "condition" && current.operator === "exists")) &&
            <label>{current.kind === "assign" ? "Owner" : current.kind === "approval" ? "Approval instructions" : current.kind === "condition" ? "Compare with" : "Title"}
              <input value={current.value} maxLength={500} onChange={event => edit({ value: event.target.value })} />
            </label>}
          {["assign", "task", "notify"].includes(current.kind) && <small>Use fields such as <code>{"{{reference}}"}</code> or <code>{"{{category}}"}</code>.</small>}
          <div className="automation-controls">
            <label>X <input type="number" min="0" max="10000" value={current.x} onChange={event => edit({ x: coordinate(+event.target.value) })} /></label>
            <label>Y <input type="number" min="0" max="10000" value={current.y} onChange={event => edit({ y: coordinate(+event.target.value) })} /></label>
          </div>
          <div className="automation-controls">
            <Button disabled={graph.nodes.length >= 100} onClick={duplicate}>Duplicate node</Button>
            <Button onClick={remove}>Delete node</Button>
          </div>
        </> : <p>Select a node to edit its settings.</p>}
        {trace.length > 0 && <><h2>{run ? "Execution trace" : "Preview trace"}</h2>
          {run && traceNode && <Button onClick={() => setTraceNode("")}>Show all steps</Button>}
          <ol className="automation-trace">{trace.filter(entry => !run || !traceNode || entry.id === traceNode).map((entry, index) => <li key={index}>
            <strong>{canvasGraph.nodes.find(step => step.id === entry.id)?.label ?? "Required approval"}</strong>
            <small>{entry.status}{entry.detail && ` · ${entry.detail}`}</small>
          </li>)}</ol>
        </>}
      </aside>
    </div>
    <div className="automation-secondary">
      <section className="panel automation-inspector">
        <h2>Test and run</h2>
        <label>Request text <textarea rows={4} maxLength={8000} value={sample} onChange={event => setSample(event.target.value)} /></label>
        <label>Simulated approvals <select value={simulate} onChange={event => setSimulate(event.target.value)}>
          <option value="">Pause at approval</option><option value="approve">Approve all</option><option value="reject">Reject all</option>
        </select></label>
        <div className="automation-controls">
          <Button disabled={busy || !sample.trim()} onClick={() => perform(async () => {
            const result = await api<Result>("/automations/preview", undefined, { graph, text: sample, decisions: simulate ? Array(101).fill(simulate) : [] })
            setPreview({ ...result, graph, sample, simulate })
            setRun(undefined)
          })}>Preview draft</Button>
          <Button disabled={busy || !sample.trim() || !id || !version} onClick={() => perform(async () => {
            const started = await api<Run>(`/automations/${id}/runs`, undefined, { text: sample, intake_key: crypto.randomUUID() })
            await load(id!)
            showRun(started)
          })}>Run published workflow</Button>
        </div>
        {currentPreview && <p role="status">Preview {currentPreview.status.replaceAll("_", " ")}.</p>}
        {id && version > 0 && <>
          <Link href={`/automations/intake/${id}`}>Open intake form</Link>
          <p>Local intake endpoint <code>POST /api/automations/{id}/runs</code></p>
          <label>Import requests from CSV <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void perform(async () => {
              if (file.size > 3400000) throw new Error("Choose a smaller CSV file.")
              setBatch(await api<typeof batch>(`/automations/${id}/csv`, undefined, { csv_text: await file.text() }))
              await load(id)
              items.reload()
            })
          }} /></label>
          <small>Use a text column and an optional intake_key column to deduplicate retries.</small>
          {batch.length > 0 && <ul className="automation-trace">{batch.map(item => <li key={item.row}>
            Request {item.row} · {item.run ? `Run #${item.run.id}` : item.error}
          </li>)}</ul>}
        </>}
      </section>
      <section className="panel automation-inspector">
        <h2>Runs</h2>
        <div className="automation-controls">
          <label>Search <input value={search} onChange={event => setSearch(event.target.value)} /></label>
          <label>Status <select value={runFilter} onChange={event => setRunFilter(event.target.value)}>
            <option value="all">All</option><option value="pending_approval">Pending approval</option>
            <option value="completed">Completed</option><option value="rejected">Rejected</option>
          </select></label>
        </div>
        <p>{runs.length} recent runs · {runs.filter(entry => entry.status === "pending_approval").length} awaiting approval</p>
        <ul className="automation-trace">{runs.filter(entry => (runFilter === "all" || entry.status === runFilter) && entry.text.toLowerCase().includes(search.toLowerCase())).map(entry =>
          <li key={entry.id}><Button disabled={busy} onClick={() => showRun(entry)}>#{entry.id} · {entry.status.replaceAll("_", " ")}</Button></li>)}</ul>
        {versions.length > 0 && <label>Restore a version into editor <select value="" disabled={busy || !!run} onChange={event => {
          const old = versions.find(entry => entry.id === Number(event.target.value))
          if (old) change(old.graph)
        }}><option value="">Select a version</option>
          {versions.map(entry => <option key={entry.id} value={entry.id}>Version {entry.number}</option>)}
        </select></label>}
      </section>
      <section className="panel automation-inspector">
        <h2>Local inbox</h2>
        {!items.data?.length && <p>Tasks and notifications from live runs appear here.</p>}
        <ul className="automation-trace">{items.data?.map(item => <li key={item.id}>
          <strong>{item.title}</strong><small>{item.kind} · Run #{item.run_id} · {item.owner || "Unassigned"}</small>
          {item.done ? <small>Done</small> : <Button disabled={busy} onClick={() => perform(async () => {
            await api(`/automation-work-items/${item.id}/complete`, undefined, {})
            items.reload()
          })}>Mark done</Button>}
        </li>)}</ul>
      </section>
    </div>
  </>
}

"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Feedback } from "@/components/ui/feedback"
import { ExecutionDetail } from "@/components/dashboard/execution-detail"
import { api, executionRef, type Execution } from "@/lib/api"

const examples = [
  ["Duplicate charge", "I was charged twice for invoice INV-2048. Please refund $180 to the original payment method and follow up with billing@example.com."],
  ["IT outage", "Critical VPN outage reported on 2026-04-07. The support team is blocked and needs help immediately."],
  ["Sales inquiry", "Can you send a quote for 30 seats and schedule a product demo with sales@example.com?"],
]

export default function Requests() {
  const [text, setText] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<Execution>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim() || pending) return
    setPending(true)
    setError(undefined)
    setResult(undefined)
    try { setResult(await api<Execution>("/requests/analyze", undefined, { text })) }
    catch (error) { setError((error as Error).message) }
    finally { setPending(false) }
  }

  return <>
    <div className="page-heading"><h1>Request processing</h1><p>Turn an incoming request into a routed workflow with actionable steps.</p></div>
    <form className="panel detail" onSubmit={submit} aria-busy={pending}>
      <label className="input-label" htmlFor="request">Business request</label>
      <textarea id="request" required value={text} maxLength={8000} disabled={pending} onChange={event => setText(event.target.value)}
        placeholder="Paste a customer email, support ticket, or internal request…" />
      <div className="form-meta"><span>Try an example</span><span>{text.length.toLocaleString()} / 8,000</span></div>
      <div className="examples">{examples.map(([label, sample]) => <Button type="button" disabled={pending} key={label} onClick={() => setText(sample)}>{label}</Button>)}</div>
      <Button type="submit" className="primary" disabled={!text.trim() || pending}>
        {pending ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
        {pending ? "Analyzing…" : "Analyze request"}
      </Button>
    </form>
    {error && <Feedback error={error} />}
    {result && <section aria-label="Request result" aria-live="polite">
      <div className="result-heading"><h2>{result.name}</h2><Link className="button" href={`/workflows/${result.id}`}>Open {executionRef(result.id)} <ArrowRight size={15} /></Link></div>
      <ExecutionDetail item={result} />
    </section>}
  </>
}

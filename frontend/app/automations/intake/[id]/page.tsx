"use client"

import { useState, type FormEvent } from "react"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import "../../automation.css"

export default function AutomationIntake() {
  const { id } = useParams<{ id: string }>()
  const [text, setText] = useState("")
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState("")
  const [error, setError] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const intakeKey = key || crypto.randomUUID()
    setKey(intakeKey)
    setBusy(true)
    setError("")
    setReceipt("")
    try {
      const run = await api<{ id: number; status: string }>(`/automations/${id}/runs`, undefined, { text, intake_key: intakeKey })
      setText("")
      setKey("")
      setReceipt(`Request #${run.id} received${run.status === "pending_approval" ? " and awaiting approval" : ""}.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Submission failed.")
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="page-heading"><h1>Submit a request</h1></div>
    <form className="panel automation-inspector" onSubmit={submit}>
      <label>Request details <textarea rows={8} value={text} maxLength={8000} required disabled={busy}
        onChange={event => { setText(event.target.value); setKey(""); setReceipt("") }} /></label>
      {error && <p role="alert">{error}</p>}
      {receipt && <p role="status">{receipt}</p>}
      <div><Button type="submit" disabled={busy || !text.trim()}>Submit request</Button></div>
    </form>
  </>
}

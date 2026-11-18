"use client"

import { Button } from "@/components/ui/button"
import { Feedback } from "@/components/ui/feedback"
import { useApi } from "@/lib/use-api"
import type { Health, Provider } from "@/lib/api"

const labels = { disabled: "Disabled", ready: "Connected", unavailable: "Unreachable", model_missing: "Model missing" }

export default function Settings() {
  const provider = useApi<Provider>("/ai/status")
  const health = useApi<Health>("/health")

  return <>
    <div className="page-heading"><h1>Settings</h1><p>Inspect the local inference provider and database connection.</p></div>
    <div className="detail-grid">
      <section className="panel detail">
        <div className="detail-heading"><h2>Inference</h2><Button onClick={provider.reload}>Check connection</Button></div>
        {provider.data ? <dl className="facts">
          <div><dt>Ollama status</dt><dd>{labels[provider.data.ollama]}</dd></div>
          <div><dt>Configured model</dt><dd>{provider.data.model}</dd></div>
          <div><dt>Active provider</dt><dd>{provider.data.ollama === "ready" ? "Local Ollama" : "Deterministic rules"}</dd></div>
          <div><dt>Rule-based fallback</dt><dd>{provider.data.fallback ? "Available" : "Unavailable"}</dd></div>
        </dl> : <Feedback error={provider.error} retry={provider.reload} />}
        <p className="muted">Set OLLAMA_ENABLED=true in the backend environment and restart FastAPI to enable local inference.</p>
      </section>
      <section className="panel detail"><h2>System</h2>
        {health.data ? <dl className="facts">
          <div><dt>FastAPI</dt><dd>{health.data.status === "ok" ? "Online" : health.data.status}</dd></div>
          <div><dt>Storage</dt><dd>{health.data.database}</dd></div>
        </dl> : <Feedback error={health.error} retry={health.reload} />}
      </section>
    </div>
  </>
}

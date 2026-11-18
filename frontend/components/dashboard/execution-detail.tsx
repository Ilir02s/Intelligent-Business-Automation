import { StatusBadge } from "./execution-table"
import { dateTime, type Execution } from "@/lib/api"

export function ExecutionDetail({ item }: { item: Execution }) {
  const result = item.analysis
  return <div className="detail-grid">
    <section className="panel detail"><div className="detail-heading"><h2>Analysis result</h2><StatusBadge status={item.status} /></div>
      <p className="summary">{result.summary}</p>
      <dl className="facts">
        <div><dt>Category</dt><dd>{result.category}</dd></div>
        <div><dt>Priority</dt><dd>{result.priority}</dd></div>
        <div><dt>Department</dt><dd>{result.department}</dd></div>
        <div><dt>Processing method</dt><dd>{result.processing_method === "ollama" ? "Local Ollama" : "Deterministic rules"}</dd></div>
      </dl>
      <h3>Extracted entities</h3>
      {result.entities.length ? <ul className="entity-list">{result.entities.map(entity =>
        <li key={entity.type + entity.value}>{entity.type} <strong>{entity.value}</strong></li>)}</ul> : <p className="muted">No entities extracted.</p>}
    </section>
    <section className="panel detail"><h2>Workflow steps</h2>
      <ol className="steps">{item.steps.map((step, index) => <li key={step.label}>
        <span className="tile">{index + 1}</span><span>{step.label} <small>{step.status}</small></span>
      </li>)}</ol>
      {item.decided_at && <p className="muted">Decision recorded {dateTime(item.decided_at)}.</p>}
    </section>
  </div>
}

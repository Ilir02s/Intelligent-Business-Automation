import Link from "next/link"
import { ArrowUpRight, Workflow } from "lucide-react"
import { dateTime, executionRef, statusLabel, type Execution } from "@/lib/api"

export function StatusBadge({ status }: { status: Execution["status"] }) {
  return <span className={`badge ${status}`}><i />{statusLabel[status]}</span>
}

export function ExecutionTable({ items }: { items: Execution[] }) {
  if (!items.length) return <div className="empty">No workflow executions yet.</div>
  return <div className="table-scroll"><table>
    <thead><tr><th scope="col">Workflow</th><th scope="col">Department</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col" className="sr-only">Details</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.id}>
      <td><Link className="table-name" href={`/workflows/${item.id}`}>
        <span className="tile"><Workflow size={16} /></span>
        <span><strong>{item.name}</strong><small>{executionRef(item.id)}{item.demo && " · Demo"}</small></span>
      </Link></td>
      <td>{item.analysis.department}</td><td><StatusBadge status={item.status} /></td>
      <td>{dateTime(item.created_at)}</td>
      <td><Link className="arrow-link" aria-label={`Open ${executionRef(item.id)}`} href={`/workflows/${item.id}`}><ArrowUpRight size={15} /></Link></td>
    </tr>)}</tbody>
  </table></div>
}

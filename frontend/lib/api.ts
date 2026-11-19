export type Status = "pending_approval" | "completed" | "rejected"
export type Execution = {
  id: number
  request_id: number
  name: string
  status: Status
  steps: { label: string; status: string }[]
  created_at: string
  decided_at: string | null
  duration_ms: number
  demo: boolean
  analysis: {
    category: string
    priority: string
    department: string
    summary: string
    entities: { type: string; value: string }[]
    recommended_actions: string[]
    processing_method: "rules" | "ollama"
  }
}
export type Dashboard = {
  total: number
  completed: number
  pending: number
  average_ms: number
  activity: { date: string; count: number; completed: number }[]
  recent: Execution[]
}
export type AuditEvent = { id: number; event: string; detail: string; created_at: string; execution: Execution }
export type Provider = { ollama: "disabled" | "ready" | "unavailable" | "model_missing"; model: string; fallback: boolean }
export type Health = { status: string; database: string }

const apiRoot = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(/\/+$/, "")

export async function api<T>(path: string, signal?: AbortSignal, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiRoot + path, {
      signal,
      cache: "no-store",
      ...(body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error("The local API is unreachable. Check that the FastAPI server is running.")
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const detail: unknown = data?.detail
    if (typeof detail === "string") throw new Error(detail)
    if (Array.isArray(detail)) {
      const messages = detail.flatMap(issue => {
        if (typeof issue?.msg !== "string") return []
        const field = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown) => part !== "body").join(".") : ""
        return [field ? `${field}: ${issue.msg}` : issue.msg]
      })
      if (messages.length) throw new Error(messages.join(" "))
    }
    throw new Error(`The API returned HTTP ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export const statusLabel: Record<Status, string> = {
  pending_approval: "Needs approval",
  completed: "Completed",
  rejected: "Rejected",
}

export function executionRef(id: number) {
  return `WF-${String(id).padStart(4, "0")}`
}

export function dateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

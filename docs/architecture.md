# FlowPilot architecture

The browser calls the Next.js origin under `/api`. Next.js forwards those requests to FastAPI over loopback. FastAPI validates incoming text, derives a deterministic classification, and optionally requests a structured result from a local Ollama model. Validation checks the model schema and verifies extracted entity values against the original request. Deterministic criticality and sensitive-action checks still apply to the selected result.

The workflow engine picks a department and a follow-up step from the category. The HTTP request persists the original input, structured analysis, workflow execution, and first audit event in one SQLite transaction. Approval updates use a conditional SQL statement to claim a pending workflow. The step update and decision event commit in that same transaction. A simultaneous or repeated decision receives HTTP 409.

A completed workflow represents completed automated routing. Approval releases an internal follow-up step for manual handling. Rejection cancels that step. The service creates no outbound email, payment, or system change. The only optional outbound request during processing targets the Ollama loopback server.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Check FastAPI and SQLite |
| `GET /api/ai/status` | Inspect Ollama readiness and fallback |
| `POST /api/requests/analyze` | Analyze and persist a request |
| `GET /api/requests` | List original text and processing results |
| `GET /api/workflows` | List paginated executions |
| `GET /api/workflows/{id}` | Inspect an execution |
| `POST /api/workflows/{id}/decision` | Approve or reject a pending execution |
| `GET /api/activity` | List paginated audit events |
| `GET /api/dashboard` | Aggregate counts, processing time, and daily activity |

Audit timestamps are stored in UTC and displayed in the browser’s local timezone. Dashboard activity is grouped by UTC day. Completions use the decision date for approved workflows and the creation date for automatically routed workflows. PeakChart renders both series locally and a daily-count table provides a text equivalent. Demo records are labeled and included in dashboard aggregates. All API mutations run through the service’s local SQLite database, and the application is intended to be bound to loopback.

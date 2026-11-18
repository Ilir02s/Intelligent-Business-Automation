import { AlertCircle, LoaderCircle } from "lucide-react"
import { Button } from "./button"

export function Feedback({ error, retry }: { error?: string; retry?: () => void }) {
  return error
    ? <div className="notice" role="alert"><AlertCircle size={17} />{error}{retry && <Button onClick={retry}>Retry</Button>}</div>
    : <div className="notice" role="status"><LoaderCircle className="spin" size={17} /> Loading workspace data…</div>
}

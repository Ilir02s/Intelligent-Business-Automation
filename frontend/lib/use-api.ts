"use client"

import { useEffect, useState } from "react"
import { api } from "./api"

export function useApi<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data?: T; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api<T>(path, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult({ path, data }) })
      .catch(error => { if (!controller.signal.aborted) setResult({ path, error: error.message }) })
    return () => controller.abort()
  }, [path, attempt])
  return {
    data: result?.path === path ? result.data : undefined,
    error: result?.path === path ? result.error : undefined,
    reload: () => { setResult(undefined); setAttempt(value => value + 1) },
  }
}

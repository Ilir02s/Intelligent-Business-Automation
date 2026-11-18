"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { PeakChart } from "@/components/ui/peak-chart"
import type { Dashboard } from "@/lib/api"

const periods = ["7 days", "30 days"]

function dayLabel(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
}

type Metric = { field: "count" | "completed"; title: string; caption: string }
const metrics: Metric[] = [
  { field: "count", title: "Requests processed", caption: "Counted on submission" },
  { field: "completed", title: "Workflows completed", caption: "Counted when routing completes" },
]

function ActivityCard({ data, days, onChange, metric }: {
  data: Dashboard["activity"]
  days: number
  onChange: (days: number) => void
  metric: Metric
}) {
  const frame = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const series = data.map(point => point[metric.field])
  const total = series.reduce((sum, value) => sum + value, 0)
  return <figure className={`peak-frame peak-${metric.field}`} ref={frame} aria-label={metric.title}>
    {width > 0 && <PeakChart
      width={width}
      data={series}
      labels={data.map(point => dayLabel(point.date))}
      title={metric.title}
      value={total}
      valueSuffix=""
      trend="none"
      updatedText="Daily activity · UTC"
      caption={metric.caption}
      periods={periods}
      period={`${days} days`}
      onPeriodChange={period => onChange(period === periods[0] ? 7 : 30)}
    />}
  </figure>
}

export function ActivityChart({ data, days, onChange }: {
  data: Dashboard["activity"]
  days: number
  onChange: (days: number) => void
}) {
  return <>
    <div className="peak-grid">{metrics.map(metric =>
      <ActivityCard key={metric.field} data={data} days={days} onChange={onChange} metric={metric} />)}</div>
    <details className="chart-data">
      <summary><ChevronDown size={14} /> View daily counts</summary>
      <div className="table-scroll"><table>
        <caption className="sr-only">Daily activity in UTC over the last {days} days</caption>
        <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Requests processed</th><th scope="col">Workflows completed</th></tr></thead>
        <tbody>{data.map(point => <tr key={point.date}>
          <th scope="row"><time dateTime={point.date}>{dayLabel(point.date)}</time></th><td>{point.count}</td><td>{point.completed}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </>
}

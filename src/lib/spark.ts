// Sparkline geometry, shared by every chart on the site.
//
// The same ~15 lines of "normalise a series into an SVG path" were copy-pasted
// into HeatSparkline, TrendSparkline and the movers rows, each with slightly
// different padding and a different bug (one divided by zero on a flat series,
// another on a single point). One implementation, tested by rendering.

export type SparkGeom = {
  /** `M…L…` polyline through every point. */
  line: string
  /** Same polyline closed along the baseline, for a gradient fill. */
  area: string
  /** Last point, for the leading dot. */
  lastX: number
  lastY: number
  min: number
  max: number
  first: number
  last: number
  /** True when every value is identical (renders as a flat mid-line). */
  flat: boolean
}

export function sparkGeom(values: number[], w = 280, h = 60, pad = 4): SparkGeom | null {
  const vals = values.map(Number).filter(v => Number.isFinite(v))
  if (vals.length < 2) return null

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min
  const flat = span === 0
  const stepX = (w - pad * 2) / (vals.length - 1)
  const innerH = h - pad * 2

  const y = (v: number) => (flat ? pad + innerH / 2 : h - pad - ((v - min) / span) * innerH)
  const x = (i: number) => pad + i * stepX

  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join("L")}`
  const area = `${line}L${x(vals.length - 1).toFixed(1)},${h}L${pad.toFixed(1)},${h}Z`

  return {
    line,
    area,
    lastX: x(vals.length - 1),
    lastY: y(vals[vals.length - 1]),
    min,
    max,
    first: vals[0],
    last: vals[vals.length - 1],
    flat,
  }
}

/** `velocity.rcSeries` is `[[date, count], …]`; archived snapshots use `[{date, rc}]`. */
export function rcValues(velocity: any): number[] {
  return (velocity?.rcSeries || [])
    .map((p: any) => (Array.isArray(p) ? p[1] : p?.rc))
    .map(Number)
    .filter((n: number) => Number.isFinite(n))
}

/** 1200 -> "1.2k", 45000 -> "45k". Keeps tabular columns narrow. */
export function compactNum(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "k"
  return String(Math.round(n))
}

/** "+312%" / "+5k%" — growth percentages get huge on tiny bases. */
export function growthLabel(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(Number(pct))) return null
  const p = Number(pct)
  const mag = Math.abs(p) >= 1000 ? Math.round(Math.abs(p) / 1000) + "k" : String(Math.abs(p))
  return `${p >= 0 ? "+" : "−"}${mag}%`
}

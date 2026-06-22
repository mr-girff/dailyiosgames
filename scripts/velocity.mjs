#!/usr/bin/env node
// Velocity / heat layer.
// Reads every daily snapshot in data/YYYY-MM-DD.json, builds a per-game time
// series (keyed by App Store id), and derives momentum signals that no one can
// reproduce by forking the code — they need the accumulated history.
//
// Computes, for each game present in data/enriched.json:
//   velocity: { rcNow, rcDelta1d, rcDelta7d, rcVelocity, rcGrowthPct,
//               rankDelta7d, daysTracked, firstSeen, presenceStreak, rcSeries }
//   heatScore: 0..100  (cohort-normalized, log-compressed, quality-gated)
//   momentum:  surging | rising | steady | fading
//   traction:  strong | traction | none
//
// Pure post-processing: no network, no API keys, no extra cost.
// Run AFTER enrich.mjs (it merges into data/enriched.json in place).

import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const ENRICHED = path.join(DATA_DIR, "enriched.json")

// ─── Tunables (revisit once real distribution is observed) ──────────────
const FLOOR = 20            // min base for percent growth (avoids low-base explosions)
const QUALITY_MIN_RATING = 4.0
const QUALITY_MIN_RC = 20
const TRACTION_ABS = 50     // new reviews/day considered "taking off"
const TRACTION_PCT = 30     // week-over-week % considered "taking off"
const SERIES_DAYS = 14      // points kept for the frontend sparkline
const DAY = 86400000

// This is a *discovery* radar: relative growth (a small game taking off) is
// weighted above raw absolute volume (giants always move a lot in absolute
// terms but are not discoveries).
const WEIGHTS = {            // renormalized over components that vary in the cohort
  growth:   0.30,           // log(1+rcGrowthPct) — relative momentum (discovery signal)
  download: 0.25,           // log(1+rcVelocity)  — absolute downloads proxy
  rankmom:  0.20,           // climbing the charts (sparse until history accrues)
  accel:    0.10,           // today's delta vs prior average
  fresh:    0.10,           // newer release = higher
  search:   0.05,           // existing google/youtube suggest signal (weak)
}

// ─── Load history ───────────────────────────────────────────────────────
async function loadSnapshots() {
  const files = (await fs.readdir(DATA_DIR))
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort() // chronological (YYYY-MM-DD sorts lexically)
  const snaps = []
  for (const f of files) {
    try {
      const j = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8"))
      snaps.push({ date: f.slice(0, 10), data: j })
    } catch {}
  }
  return snaps
}

// Build per-id time series: [{ date, rc, rating, bestRank }] in date order.
function buildSeries(snaps) {
  const series = new Map()
  for (const { date, data } of snaps) {
    const rows = [...(data.newReleases || []), ...(data.updates || [])]
    for (const g of rows) {
      const id = String(g.id)
      const r = g.rank || {}
      const ranks = [r.free, r.grossing, r.new].filter(v => typeof v === "number")
      const bestRank = ranks.length ? Math.min(...ranks) : null
      if (!series.has(id)) series.set(id, [])
      series.get(id).push({
        date,
        rc: Number(g.ratingCount) || 0,
        rating: Number(g.rating) || 0,
        bestRank,
        relDate: g.releaseDate,
      })
    }
  }
  return series
}

const daysBetween = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / DAY))

// ─── Per-game raw metrics ────────────────────────────────────────────────
function computeVelocity(points, todayDate) {
  // points sorted by date asc; last point is "now"
  const last = points[points.length - 1]
  const rcNow = last.rc

  // Previous available snapshot (handles gaps).
  const prev = points.length >= 2 ? points[points.length - 2] : null
  const rcDelta1d = prev ? Math.max(0, rcNow - prev.rc) : 0
  const gap1d = prev ? daysBetween(prev.date, last.date) : 1

  // ~7 days ago (or earliest available within 7d window).
  const sevenAgo = new Date(new Date(last.date) - 7 * DAY)
  let base7 = points[0]
  for (const p of points) { if (new Date(p.date) <= sevenAgo) base7 = p }
  const elapsed7 = daysBetween(base7.date, last.date)
  const rcDelta7d = Math.max(0, rcNow - base7.rc)
  const rcVelocity = rcDelta7d / elapsed7
  const rcGrowthPct = rcNow >= FLOOR
    ? +(100 * rcDelta7d / Math.max(base7.rc, FLOOR)).toFixed(1)
    : null // suppress percent at low base

  // Acceleration: is the most recent daily delta faster than the prior average?
  const priorDeltas = []
  for (let i = 1; i < points.length - 1; i++) {
    const d = daysBetween(points[i - 1].date, points[i].date)
    priorDeltas.push(Math.max(0, points[i].rc - points[i - 1].rc) / d)
  }
  const avgPrior = priorDeltas.length ? priorDeltas.reduce((a, b) => a + b, 0) / priorDeltas.length : 0
  const accel = Math.max(0, (rcDelta1d / gap1d) - avgPrior)

  // Rank momentum (positive = climbing). Sparse until history accrues.
  let rankDelta7d = null
  if (last.bestRank != null && base7.bestRank != null && base7 !== last) {
    rankDelta7d = base7.bestRank - last.bestRank
  }

  // Presence streak (consecutive trailing days seen).
  let presenceStreak = 1
  for (let i = points.length - 2; i >= 0; i--) {
    if (daysBetween(points[i].date, points[i + 1].date) === 1) presenceStreak++
    else break
  }

  const rcSeries = points.slice(-SERIES_DAYS).map(p => ({ date: p.date, rc: p.rc }))
  const seenToday = last.date === todayDate

  return {
    rcNow, rcDelta1d, rcDelta7d,
    rcVelocity: +rcVelocity.toFixed(2),
    rcGrowthPct,
    rankDelta7d,
    accel: +accel.toFixed(2),
    daysTracked: points.length,
    firstSeen: points[0].date,
    presenceStreak,
    seenToday,
    ratingNow: last.rating,
    rcSeries,
  }
}

// ─── Cohort normalization + heat score ────────────────────────────────────
function normalizer(values) {
  const nums = values.filter(v => typeof v === "number" && isFinite(v))
  const min = Math.min(...nums, 0)
  const max = Math.max(...nums, 0)
  const span = max - min
  return (v) => (span > 0 && typeof v === "number" && isFinite(v)) ? (v - min) / span : 0
}

function scoreCohort(items) {
  // Raw component values (log-compress the heavy-tailed ones).
  const comp = items.map(it => {
    const v = it.velocity
    return {
      growth:   v.rcGrowthPct == null ? 0 : Math.log1p(Math.max(0, v.rcGrowthPct)),
      download: Math.log1p(Math.max(0, v.rcVelocity)),
      accel:    Math.log1p(Math.max(0, v.accel)),
      rankmom:  v.rankDelta7d == null ? null : v.rankDelta7d, // higher = climbing
      fresh:    1 / (1 + Math.max(0, it.daysSinceRelease ?? 60) / 7),
      search:   Math.max(0, it.signal || 0),
    }
  })

  // Per-component normalizers; only keep components that vary in this cohort.
  const keys = Object.keys(WEIGHTS)
  const norms = {}
  const active = {}
  for (const k of keys) {
    const vals = comp.map(c => c[k]).filter(v => typeof v === "number")
    const varies = new Set(vals.map(v => Math.round(v * 1000))).size > 1
    norms[k] = normalizer(comp.map(c => c[k]))
    active[k] = varies
  }
  // Renormalize weights over active components (handles rank cold-start).
  const wsum = keys.reduce((s, k) => s + (active[k] ? WEIGHTS[k] : 0), 0) || 1

  items.forEach((it, i) => {
    let score = 0
    for (const k of keys) {
      if (!active[k]) continue
      score += (WEIGHTS[k] / wsum) * norms[k](comp[i][k])
    }
    let heat = score * 100

    // Quality gate (multiplicative): low rating or tiny base halves the score.
    const v = it.velocity
    const passesQuality = v.ratingNow >= QUALITY_MIN_RATING && v.rcNow >= QUALITY_MIN_RC
    if (!passesQuality) heat *= 0.5

    it.heatScore = Math.round(heat)

    // Momentum label.
    if (!v.seenToday) it.momentum = "fading"
    else if (it.heatScore >= 70 && v.accel > 0) it.momentum = "surging"
    else if (it.heatScore >= 45 || v.rcVelocity > 0) it.momentum = "rising"
    else it.momentum = "steady"

    // Traction level (absolute OR relative, gated on quality).
    const absHit = v.rcVelocity >= TRACTION_ABS
    const pctHit = v.rcGrowthPct != null && v.rcGrowthPct >= TRACTION_PCT
    if (passesQuality && absHit && pctHit) it.traction = "strong"
    else if (passesQuality && (absHit || pctHit)) it.traction = "traction"
    else it.traction = "none"
  })
}

async function main() {
  let enriched
  try { enriched = JSON.parse(await fs.readFile(ENRICHED, "utf8")) }
  catch { console.error("enriched.json not found; run enrich first."); process.exit(0) }

  const snaps = await loadSnapshots()
  if (!snaps.length) { console.log("No snapshots yet; skipping velocity."); return }
  const todayDate = snaps[snaps.length - 1].date
  const series = buildSeries(snaps)

  const all = enriched.all || []
  for (const g of all) {
    const points = series.get(String(g.id))
    if (!points || !points.length) {
      g.velocity = null; g.heatScore = 0; g.momentum = "steady"; g.traction = "none"
      continue
    }
    g.velocity = computeVelocity(points, todayDate)
  }

  // Score only games that have a velocity object (cohort = today's tracked set).
  scoreCohort(all.filter(g => g.velocity))

  const out = { ...enriched, velocityComputedAt: new Date().toISOString(), all }
  await fs.writeFile(ENRICHED, JSON.stringify(out, null, 2))

  const movers = all.filter(g => g.traction !== "none").length
  const surging = all.filter(g => g.momentum === "surging").length
  console.log(`Velocity computed for ${all.length} games across ${snaps.length} snapshots. ` +
              `Movers: ${movers}, surging: ${surging}.`)
}

main().catch(e => { console.error(e); process.exit(1) })

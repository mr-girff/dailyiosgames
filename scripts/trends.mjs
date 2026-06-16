// Pull Google Trends interest-over-time for each indexable game.
// Uses the undocumented widget API. No key. Be polite (sleep between calls).
// Output: writes data.trends to data/enriched.json per game.

import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "data/enriched.json")
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function explore(q) {
  const body = {
    comparisonItem: [{ keyword: q, geo: "US", time: "today 3-m" }],
    category: 0, property: "",
  }
  const u = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(body))}`
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (TrendsBot)" } })
  if (!r.ok) throw new Error(`explore ${r.status}`)
  const txt = (await r.text()).replace(/^\)]}',?\n/, "") // strip XSSI prefix
  return JSON.parse(txt).widgets
}

async function timelineFromWidget(widget) {
  const req = encodeURIComponent(JSON.stringify(widget.request))
  const token = widget.token
  const u = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${req}&token=${token}`
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (TrendsBot)" } })
  if (!r.ok) throw new Error(`widget ${r.status}`)
  const txt = (await r.text()).replace(/^\)]}',?\n/, "")
  const j = JSON.parse(txt)
  const series = j.default.timelineData.map(p => ({ t: p.formattedAxisTime, v: p.value?.[0] ?? 0 }))
  return series
}

async function pullTrend(q) {
  const widgets = await explore(q)
  const tl = widgets.find(w => w.id === "TIMESERIES")
  if (!tl) return null
  return await timelineFromWidget(tl)
}

function summarize(series) {
  if (!series?.length) return null
  const vals = series.map(p => p.v)
  const max = Math.max(...vals), min = Math.min(...vals)
  const recent = vals.slice(-4).reduce((a,b)=>a+b,0) / 4
  const prior  = vals.slice(-12,-4).reduce((a,b)=>a+b,0) / 8 || 1
  const slope = (recent - prior) / prior   // negative = falling, positive = rising
  return { points: series, max, min, recentAvg: Math.round(recent), slopePct: Math.round(slope*100) }
}

async function main() {
  const data = JSON.parse(await fs.readFile(SRC, "utf8"))
  const games = data.all.filter(g => g.indexDirective?.startsWith("index"))
  console.log(`Pulling trends for ${games.length} games`)
  let ok = 0, fail429 = 0
  for (const g of games) {
    if (fail429 >= 8) {
      console.log(`Aborting trends: ${fail429} consecutive 429s. Google Trends is blocking this IP. Skipping remaining ${games.length - games.indexOf(g)} games.`)
      break
    }
    try {
      const series = await pullTrend(g.name)
      const s = summarize(series)
      if (s) { g.trends = s; ok++; fail429 = 0 }
      await sleep(800)
    } catch (e) {
      if (/429/.test(e.message)) fail429++; else fail429 = 0
      console.warn(`trend fail ${g.name}: ${e.message}`)
      await sleep(1500)
    }
  }
  await fs.writeFile(SRC, JSON.stringify(data, null, 2))
  console.log(`Trends collected for ${ok}/${games.length} games`)
}

main().catch(e => { console.error(e); process.exit(1) })

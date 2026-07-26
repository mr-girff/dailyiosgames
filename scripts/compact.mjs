// Snapshot compaction — keeps the repository from growing without bound.
//
// Every day the pipeline commits a full data/YYYY-MM-DD.json (~380 KB: full
// descriptions, release notes, screenshot URLs for ~130 games). That is ~140 MB
// of git objects per year for data that is only ever read again by velocity.mjs,
// which needs nothing but the time series (id, ratingCount, rating, chart ranks).
//
// Snapshots older than KEEP_FULL_DAYS are rewritten in "slim" form: the fields
// velocity.mjs uses, nothing else. The persistent catalogue (data/catalog.json)
// already holds the newest full record for every game, so no page content is lost.
//
// Idempotent: a snapshot already slim is left untouched.

import fs from "node:fs/promises"
import path from "node:path"

const DATA_DIR = path.join(process.cwd(), "data")
const KEEP_FULL_DAYS = Number(process.env.KEEP_FULL_DAYS || 60)
const DAY = 86400000

const SLIM_FIELDS = ["id", "ratingCount", "rating", "rank", "releaseDate", "currentVersionDate"]

function slimGame(g) {
  const out = {}
  for (const f of SLIM_FIELDS) if (g[f] !== undefined) out[f] = g[f]
  return out
}

async function main() {
  const today = Date.now()
  const files = (await fs.readdir(DATA_DIR)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  let compacted = 0, saved = 0
  for (const f of files) {
    const date = f.slice(0, 10)
    const ageDays = Math.round((today - new Date(date + "T00:00:00Z").getTime()) / DAY)
    if (ageDays <= KEEP_FULL_DAYS) continue
    const p = path.join(DATA_DIR, f)
    const before = (await fs.stat(p)).size
    const snap = JSON.parse(await fs.readFile(p, "utf8"))
    if (snap.slim) continue
    const out = {
      date: snap.date || date,
      slim: true,
      note: "Compacted snapshot: only the fields used to compute velocity/heat are retained. Full metadata lives in data/catalog.json.",
      newReleases: (snap.newReleases || []).map(slimGame),
      updates: (snap.updates || []).map(slimGame),
      generatedAt: snap.generatedAt,
    }
    await fs.writeFile(p, JSON.stringify(out, null, 2))
    const after = (await fs.stat(p)).size
    compacted++
    saved += before - after
    console.log(`compact: ${f} ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB`)
  }
  console.log(`Compaction done: ${compacted} snapshot(s), ${(saved / 1024).toFixed(0)}KB saved. Keeping full detail for the last ${KEEP_FULL_DAYS} days.`)
}

main().catch(e => { console.error(e); process.exit(1) })

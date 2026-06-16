// Pull confirmed user reviews from the shared reviews-worker into data/reviews.json.
// Reads the worker URL from PUBLIC_REVIEWS_WORKER. No-ops if unset.

import fs from "node:fs/promises"
import path from "node:path"

const WORKER = process.env.PUBLIC_REVIEWS_WORKER
const OUT = path.join(process.cwd(), "data/reviews.json")

async function main() {
  if (!WORKER) { console.log("PUBLIC_REVIEWS_WORKER not set; skipping reviews sync."); return }
  const r = await fetch(`${WORKER.replace(/\/$/, "")}/export`)
  if (!r.ok) { console.warn(`reviews export ${r.status}`); return }
  const j = await r.json()
  await fs.writeFile(OUT, JSON.stringify(j, null, 2))
  const games = Object.keys(j).length
  const total = Object.values(j).reduce((a, b) => a + b.length, 0)
  console.log(`Reviews: ${total} across ${games} games`)
}
main().catch(e => { console.error(e); process.exit(1) })

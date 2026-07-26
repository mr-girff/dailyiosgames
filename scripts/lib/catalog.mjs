// Persistent game catalogue.
//
// Why this exists: the pipeline used to build the whole site from data/latest.json,
// i.e. *today's* App Store chart snapshot only. 7–16 games fall off the charts
// every day, so their /games/<id>/ pages disappeared from the next build and every
// already-indexed URL turned into a 404 (~260 dead URLs accumulated in 40 days).
//
// The catalogue is the union of every game ever seen. It is rebuilt from the daily
// snapshots on every run and persisted to data/catalog.json so it survives snapshot
// pruning/compaction. Pages are generated for every catalogue entry; staleness is
// expressed with `active` / `daysSinceSeen` (and a noindex directive) instead of
// deleting the page.

import fs from "node:fs/promises"
import path from "node:path"

const DAY = 86400000

// Raw fields worth persisting per game (everything the detail page renders).
const RAW_FIELDS = [
  "id", "name", "seller", "bundle", "price", "genres", "releaseDate",
  "currentVersionDate", "version", "rating", "ratingCount", "size_mb", "url",
  "rank", "icon", "screenshots", "desc", "releaseNotes", "signal", "verdict",
]

// Enrichment that is expensive to recompute and must be carried across runs
// (R2 image variants, generated teasers, Google Trends series, LLM polish).
const CARRY_FIELDS = [
  "images", "video", "trends", "competitors", "llmEnriched",
]

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY)

function pick(src, fields) {
  const out = {}
  for (const f of fields) if (src[f] !== undefined) out[f] = src[f]
  return out
}

async function readJSON(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, "utf8")) } catch { return fallback }
}

async function snapshotFiles(dataDir) {
  const files = (await fs.readdir(dataDir)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  return files.sort() // YYYY-MM-DD sorts chronologically
}

/**
 * Build the merged catalogue.
 *
 * @param {object} opts
 * @param {string} opts.dataDir          directory holding the snapshots (data/)
 * @param {string} [opts.today]          reference date (defaults to newest snapshot)
 * @param {object} [opts.carryFrom]      previous enriched.json (to carry images/video/trends)
 * @returns {Promise<{games: object[], today: string, stats: object}>}
 */
export async function buildCatalog({ dataDir, today, carryFrom }) {
  const catalogPath = path.join(dataDir, "catalog.json")
  const previous = await readJSON(catalogPath, { games: {} })
  const byId = new Map(Object.entries(previous.games || {}))

  const files = await snapshotFiles(dataDir)
  for (const f of files) {
    const date = f.slice(0, 10)
    const snap = await readJSON(path.join(dataDir, f), null)
    if (!snap) continue
    for (const g of [...(snap.newReleases || []), ...(snap.updates || [])]) {
      const id = String(g.id)
      const prev = byId.get(id)
      const raw = pick(g, RAW_FIELDS)
      raw.id = id
      // Newest snapshot wins for metadata; keep the earliest firstSeen.
      const merged = prev ? { ...prev, ...raw } : raw
      merged.firstSeen = prev?.firstSeen && prev.firstSeen < date ? prev.firstSeen : (prev?.firstSeen || date)
      merged.lastSeen = !prev?.lastSeen || prev.lastSeen < date ? date : prev.lastSeen
      merged.daysSeen = (prev?.lastSeen === date ? (prev.daysSeen || 1) : (prev?.daysSeen || 0) + 1)
      byId.set(id, merged)
    }
  }

  const refDate = today || files[files.length - 1]?.slice(0, 10) || new Date().toISOString().slice(0, 10)

  // Carry expensive enrichment forward.
  const carry = new Map(((carryFrom || {}).all || []).map(g => [String(g.id), g]))

  const games = [...byId.values()].map(g => {
    const carried = carry.get(g.id)
    const out = { ...g, ...(carried ? pick(carried, CARRY_FIELDS) : {}) }
    out.daysSinceSeen = Math.max(0, daysBetween(out.lastSeen, refDate))
    out.active = out.lastSeen === refDate
    // Recompute age relative to the reference date so archived entries do not
    // keep reporting "2d ago" forever.
    if (out.releaseDate) out.daysSinceRelease = Math.max(0, daysBetween(out.releaseDate, refDate))
    if (out.currentVersionDate) out.daysSinceUpdate = Math.max(0, daysBetween(out.currentVersionDate, refDate))
    return out
  })

  // Persist (id-keyed, raw + carried fields only — no derived classification).
  const persisted = Object.fromEntries(games.map(g => [
    g.id,
    { ...pick(g, RAW_FIELDS), ...pick(g, CARRY_FIELDS), firstSeen: g.firstSeen, lastSeen: g.lastSeen, daysSeen: g.daysSeen },
  ]))
  await fs.writeFile(catalogPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    referenceDate: refDate,
    count: games.length,
    games: persisted,
  }, null, 2))

  return {
    games,
    today: refDate,
    stats: {
      total: games.length,
      active: games.filter(g => g.active).length,
      snapshots: files.length,
    },
  }
}

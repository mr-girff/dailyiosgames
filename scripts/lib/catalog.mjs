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
import { serialize } from "./json.mjs"

const DAY = 86400000

// Raw fields worth persisting per game (everything the detail page renders).
const RAW_FIELDS = [
  "id", "name", "seller", "bundle", "price", "genres", "releaseDate",
  "currentVersionDate", "version", "rating", "ratingCount", "size_mb", "url",
  "rank", "icon", "screenshots", "desc", "releaseNotes", "searchDemand",
]

// Enrichment that is expensive to recompute and must be carried across runs
// (R2 image variants, generated teasers, Google Trends series, LLM polish).
const CARRY_FIELDS = [
  "images", "video", "trends", "competitors", "llmEnriched",
]

// Recomputed from a stored date on every read, so they must never be written out.
const DERIVED_FIELDS = ["daysSinceRelease", "daysSinceUpdate", "daysSinceSeen"]

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

  // Presence is recounted from the snapshots on every run instead of being
  // incremented off the persisted value: every run replays the full snapshot
  // history, so incrementing added the whole history again each time (daysSeen
  // climbed by ~1 per snapshot per run — 118 became 157 on a single re-run) and
  // rewrote the field for every game in the process. compact.mjs keeps every id
  // in every snapshot, so the count is always recoverable from them.
  const seenDays = new Map()   // id -> distinct snapshot dates
  const countedOn = new Map()  // id -> last date already counted (same-day dedupe:
                               // a game can be in newReleases *and* updates)
  const seenFirst = new Map()  // id -> earliest snapshot date
  const seenLast = new Map()   // id -> latest snapshot date

  for (const f of files) {
    const date = f.slice(0, 10)
    const snap = await readJSON(path.join(dataDir, f), null)
    if (!snap) continue
    for (const g of [...(snap.newReleases || []), ...(snap.updates || [])]) {
      const id = String(g.id)
      const prev = byId.get(id)
      const raw = pick(g, RAW_FIELDS)
      raw.id = id
      // Newest snapshot wins for metadata (files are replayed in date order).
      byId.set(id, prev ? { ...prev, ...raw } : raw)

      if (countedOn.get(id) !== date) {
        seenDays.set(id, (seenDays.get(id) || 0) + 1)
        countedOn.set(id, date)
      }
      if (!seenFirst.has(id)) seenFirst.set(id, date)
      seenLast.set(id, date)
    }
  }

  // Reference date = the most recent evidence we have, whichever source it comes
  // from. Taking `today` (data/latest.json's date) alone is unsafe: if latest.json
  // is stale while a newer data/YYYY-MM-DD.json exists — a partially failed run,
  // a manual backfill — then no game's lastSeen equals refDate, every entry is
  // marked archived at once, and the whole catalogue flips to noindex.
  const newestSnapshot = files[files.length - 1]?.slice(0, 10)
  const refDate = [today, newestSnapshot].filter(Boolean).sort().pop()
    || new Date().toISOString().slice(0, 10)

  // Carry expensive enrichment forward.
  const carry = new Map(((carryFrom || {}).all || []).map(g => [String(g.id), g]))

  const games = [...byId.values()].map(g => {
    const carried = carry.get(g.id)
    const out = { ...g, ...(carried ? pick(carried, CARRY_FIELDS) : {}) }
    // firstSeen / lastSeen / daysSeen are recomputed from the snapshots, which are
    // only ever slimmed, never deleted (see compact.mjs). Carrying them forward
    // from the persisted catalogue made them monotonic and therefore unfixable:
    // one snapshot with a wrong or future date would pin lastSeen ahead of every
    // real snapshot, no entry would match refDate, and the entire catalogue would
    // be marked archived and noindexed — permanently, since the bad value kept
    // being carried. The stored value is now only a fallback for an entry that no
    // snapshot mentions at all.
    out.firstSeen = seenFirst.get(out.id) ?? out.firstSeen
    out.lastSeen = seenLast.get(out.id) ?? out.lastSeen
    out.daysSeen = seenDays.get(out.id) ?? out.daysSeen ?? 0
    out.active = out.lastSeen === refDate
    // `daysSinceSeen` / `daysSinceRelease` / `daysSinceUpdate` are deliberately
    // NOT stored: they are a function of a stored date and the current day, so
    // persisting them rewrote every entry on every run (the largest single
    // source of churn in data/enriched.json) and left the numbers stale on any
    // build that did not refresh data. src/lib/enriched.ts derives them at build
    // time from lastSeen / releaseDate / currentVersionDate.
    for (const f of DERIVED_FIELDS) delete out[f]
    // One-time migration of the old names (see fetch_daily.mjs).
    if (out.searchDemand === undefined && out.signal !== undefined) out.searchDemand = out.signal
    delete out.signal
    delete out.verdict
    return out
  })

  // Persist (id-keyed, raw + carried fields only — no derived classification).
  const persisted = Object.fromEntries(games.map(g => [
    g.id,
    { ...pick(g, RAW_FIELDS), ...pick(g, CARRY_FIELDS), firstSeen: g.firstSeen, lastSeen: g.lastSeen, daysSeen: g.daysSeen },
  ]))
  await fs.writeFile(catalogPath, serialize({
    updatedAt: new Date().toISOString(),
    referenceDate: refDate,
    count: games.length,
    games: persisted,
  }))

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

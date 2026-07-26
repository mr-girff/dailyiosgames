// Shared loader for the enriched dataset used by long-tail landing pages.
import fs from "node:fs"
import path from "node:path"

export type Game = {
  id: string
  name: string
  seller: string
  archetype?: string
  price?: string
  rating?: number
  ratingCount?: number
  releaseDate?: string
  currentVersionDate?: string
  version?: string
  // Derived at load time from the dates above — never stored. See hydrate().
  daysSinceRelease?: number
  daysSinceUpdate?: number
  monetization?: string
  tags?: string[]
  coreLoop?: string
  uniqueHook?: string
  sessionLength?: string
  audience?: string
  desc?: string
  icon?: string
  images?: { icon?: { src?: string } }
  heatScore?: number
  momentum?: string
  traction?: string
  /**
   * Number of Google + YouTube autocomplete completions for the title: how much
   * the game is already being searched for. Previously called `signal`, with a
   * derived `verdict` of "build" | "watch" | "skip" — both inherited from the
   * template's original "which keyword should I build a site for?" purpose. The
   * verdict was rendered to readers as a "High signal" badge and used as
   * "Editor's picks", implying an editorial review that never happened.
   */
  searchDemand?: number
  /** @deprecated old name for searchDemand; still present in archived snapshots. */
  signal?: number
  indexDirective?: string
  /** Ids of related games, best first (legacy snapshots may hold objects). */
  similar?: (string | { id: string })[]
  // Catalogue bookkeeping (see scripts/lib/catalog.mjs).
  active?: boolean
  firstSeen?: string
  lastSeen?: string
  daysSeen?: number
  daysSinceSeen?: number
}

export type Enriched = {
  date?: string
  all: Game[]
  catalog?: { referenceDate?: string; active?: number; archived?: number; snapshots?: number }
  [k: string]: unknown
}

const DAY = 86_400_000
const todayUTC = () => new Date().toISOString().slice(0, 10)

/** Whole days between two YYYY-MM-DD dates; null when the input is unusable. */
export function daysBetween(from?: string, to: string = todayUTC()): number | null {
  if (!from) return null
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.round((b - a) / DAY))
}

/**
 * `daysSince*` are pure functions of a stored date and "now", so they are derived
 * here rather than persisted. Two reasons:
 *
 *   1. Persisting them rewrote ~1000 lines of data/enriched.json every single day
 *      (every game's age changes daily), which dominated the repo's growth.
 *   2. They were only recalculated by the cron job, so any build that did not
 *      refresh data — a rebuild, a rollback, a content-only commit — rendered
 *      "3d ago" for a week-old update.
 */
function hydrate(g: Game): Game {
  const daysSinceRelease = daysBetween(g.releaseDate)
  const daysSinceUpdate = daysBetween(g.currentVersionDate)
  const daysSinceSeen = daysBetween(g.lastSeen)
  return {
    ...g,
    ...(daysSinceRelease === null ? {} : { daysSinceRelease }),
    ...(daysSinceUpdate === null ? {} : { daysSinceUpdate }),
    ...(daysSinceSeen === null ? {} : { daysSinceSeen }),
  }
}

// Parsed once per build: this file is ~2.4 MB and 19 pages used to read and parse
// it independently.
let cache: Enriched | null = null

export function loadEnriched(): Enriched {
  if (cache) return cache
  const p = path.join(process.cwd(), "data/enriched.json")
  if (!fs.existsSync(p)) return (cache = { all: [] })
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Enriched
  return (cache = { ...raw, all: ((raw.all || []) as Game[]).map(hydrate) })
}

export function loadAll(): Game[] {
  return loadEnriched().all
}

/** searchDemand, tolerating pre-rename data. */
export const demandOf = (g: Game) => Number(g.searchDemand ?? g.signal ?? 0)

export const isIndexable = (g: Game) => (g.indexDirective || "index,follow").startsWith("index")

export function rankByHeat(games: Game[]) {
  return [...games].sort(
    (a, b) =>
      (b.heatScore || 0) - (a.heatScore || 0) ||
      demandOf(b) - demandOf(a) ||
      (a.daysSinceRelease ?? 9999) - (b.daysSinceRelease ?? 9999),
  )
}

export const cap = (s: string) =>
  (s || "").replace(/(^|-)\w/g, c => c.toUpperCase()).replace(/-/g, " ")

export const priceLabel = (g: Game) => {
  const p = g.price
  return !p || p === "Free" || p === "0" ? "Free" : p
}

export function gameIconSrc(g: Game) {
  return g.images?.icon?.src || g.icon || ""
}

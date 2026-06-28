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
  signal?: number
  verdict?: string
  indexDirective?: string
  similar?: { id: string }[]
}

export function loadAll(): Game[] {
  const p = path.join(process.cwd(), "data/enriched.json")
  if (!fs.existsSync(p)) return []
  return (JSON.parse(fs.readFileSync(p, "utf8")).all || []) as Game[]
}

export const isIndexable = (g: Game) => (g.indexDirective || "index,follow").startsWith("index")

export function rankByHeat(games: Game[]) {
  return [...games].sort(
    (a, b) =>
      (b.heatScore || 0) - (a.heatScore || 0) ||
      (b.signal || 0) - (a.signal || 0) ||
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

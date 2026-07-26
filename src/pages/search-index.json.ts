// Compact static search index consumed by /search/ (client-side, no server).
// Keys are short on purpose: the whole catalogue has to stay a small download.
//   i id · n name · s seller · a archetype · m monetization · p price
//   t tags · h heatScore · r rating · c ratingCount · d daysSinceRelease · x active
import { loadAll, priceLabel } from "../lib/enriched"

export async function GET() {
  const games = loadAll()
    .sort((a, b) =>
      Number(b.active ?? true) - Number(a.active ?? true) ||
      (b.heatScore || 0) - (a.heatScore || 0) ||
      (a.name || "").localeCompare(b.name || ""))
    .map(g => ({
      i: g.id,
      n: g.name,
      s: g.seller,
      a: g.archetype || "",
      m: g.monetization || "",
      p: priceLabel(g),
      t: g.tags || [],
      h: g.heatScore || 0,
      r: g.rating || 0,
      c: g.ratingCount || 0,
      d: g.daysSinceRelease ?? null,
      x: g.active === false ? 0 : 1,
    }))

  return new Response(JSON.stringify({ count: games.length, games }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=600, s-maxage=1800",
    },
  })
}

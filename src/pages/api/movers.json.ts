// Rising-games feed: every tracked game with a heat signal, ranked.
// CORS open. Seeds the "export" surface for the developer-facing radar.
import fs from "node:fs"
import path from "node:path"
import { appStoreUrl } from "../../lib/appstore"

export async function GET({ site }) {
  const p = path.join(process.cwd(), "data/enriched.json")
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { all: [], date: null }
  const base = site?.toString().replace(/\/$/, "") || ""

  const movers = (data.all || [])
    .filter(g => typeof g.heatScore === "number" && g.heatScore > 0)
    .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
    .map((g, i) => ({
      rank: i + 1,
      id: g.id,
      name: g.name,
      seller: g.seller,
      archetype: g.archetype,
      monetization: g.monetization,
      price: g.price,
      rating: g.rating,
      ratingCount: g.ratingCount,
      heatScore: g.heatScore,
      momentum: g.momentum,
      traction: g.traction,
      velocity: g.velocity ? {
        rcNow: g.velocity.rcNow,
        rcDelta7d: g.velocity.rcDelta7d,
        rcVelocity: g.velocity.rcVelocity,
        rcGrowthPct: g.velocity.rcGrowthPct,
        rankDelta7d: g.velocity.rankDelta7d,
        daysTracked: g.velocity.daysTracked,
        firstSeen: g.velocity.firstSeen,
      } : null,
      appStoreUrl: appStoreUrl(g),
      pageUrl: `${base}/games/${g.id}/`,
      icon: g.images?.icon?.src || g.icon || null,
    }))

  return new Response(JSON.stringify({
    name: "Rising iOS Games — early-traction radar",
    description: "iOS games ranked by a cohort-normalized heat score derived from daily App Store snapshots.",
    updated: data.date || new Date().toISOString().slice(0, 10),
    count: movers.length,
    movers,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    }
  })
}

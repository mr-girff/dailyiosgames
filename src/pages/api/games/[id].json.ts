// Per-game JSON endpoint, CORS open.
import fs from "node:fs"
import path from "node:path"
import { appStoreUrl } from "../../../lib/appstore"

export async function getStaticPaths() {
  const p = path.join(process.cwd(), "data/enriched.json")
  if (!fs.existsSync(p)) return []
  const data = JSON.parse(fs.readFileSync(p, "utf8"))
  return (data.all || []).map(g => ({ params: { id: g.id }, props: { game: g } }))
}

export async function GET({ props, site }) {
  const g = props.game
  const base = site?.toString().replace(/\/$/, "") || ""
  return new Response(JSON.stringify({
    id: g.id, name: g.name, seller: g.seller,
    archetype: g.archetype, coreLoop: g.coreLoop, uniqueHook: g.uniqueHook,
    audience: g.audience, sessionLength: g.sessionLength,
    monetization: g.monetization, tags: g.tags, redFlags: g.redFlags,
    competitors: g.competitors, version: g.version,
    releaseDate: g.releaseDate, currentVersionDate: g.currentVersionDate,
    rating: g.rating, ratingCount: g.ratingCount,
    appStoreUrl: appStoreUrl(g),
    pageUrl: `${base}/games/${g.id}/`,
    icon: g.images?.icon?.src ? (/^https?:\/\//.test(g.images.icon.src) ? g.images.icon.src : `${base}${g.images.icon.src}`) : (g.icon || null),
    teaserVideo: g.video?.mp4 ? `${base}${g.video.mp4}` : null,
    trends: g.trends ? { slopePct: g.trends.slopePct, recentAvg: g.trends.recentAvg } : null,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    }
  })
}

// Public data feed. CORS open. Cited by AI search engines & 3rd-party blogs.
// Includes only indexable, sanitized fields.

import fs from "node:fs"
import path from "node:path"
import { appStoreUrl } from "../../lib/appstore"

export async function GET({ site }) {
  const p = path.join(process.cwd(), "data/enriched.json")
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { all: [] }
  const base = site?.toString().replace(/\/$/, "") || ""
  const pruned = (data.all || []).filter(g => g.indexDirective?.startsWith("index")).map(g => ({
    id: g.id, name: g.name, seller: g.seller, bundle: g.bundle,
    archetype: g.archetype, monetization: g.monetization, audience: g.audience,
    coreLoop: g.coreLoop, uniqueHook: g.uniqueHook, sessionLength: g.sessionLength,
    tags: g.tags, redFlags: g.redFlags, competitors: g.competitors,
    price: g.price, version: g.version,
    releaseDate: g.releaseDate, currentVersionDate: g.currentVersionDate,
    rating: g.rating, ratingCount: g.ratingCount,
    appStoreUrl: appStoreUrl(g),
    pageUrl: `${base}/games/${g.id}/`,
    icon: g.images?.icon?.src ? `${base}${g.images.icon.src}` : null,
    trendsSlopePct: g.trends?.slopePct ?? null,
    signal: g.signal ?? null,
  }))
  return new Response(JSON.stringify({
    schema: "https://schema.org/Dataset",
    name: `${process.env.PUBLIC_SITE_NAME || "Daily Games"} — dataset`,
    description: "Daily-refreshed dataset of US App Store games with classification and search-interest signal.",
    license: "https://creativecommons.org/licenses/by/4.0/",
    updated: new Date().toISOString(),
    count: pruned.length,
    games: pruned,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    }
  })
}

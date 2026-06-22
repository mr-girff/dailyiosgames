// Rising iOS Games RSS feed — for developers/scouts who want the heat list in their reader.
import fs from "node:fs"
import path from "node:path"

export async function GET({ site }) {
  const p = path.join(process.cwd(), "data/enriched.json")
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { all: [], date: null }
  const base = site?.toString().replace(/\/$/, "") || ""

  const movers = (data.all || [])
    .filter(g => typeof g.heatScore === "number" && g.heatScore > 0)
    .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
    .slice(0, 30)

  const pubDate = data.date ? new Date(data.date + "T07:00:00Z") : new Date()

  const items = movers.map((g, i) => {
    const growth = g.velocity?.rcGrowthPct != null
      ? `, +${g.velocity.rcGrowthPct >= 1000 ? Math.round(g.velocity.rcGrowthPct / 1000) + "k" : g.velocity.rcGrowthPct}% ratings/7d`
      : ""
    const mom = g.momentum && g.momentum !== "steady" ? `, ${g.momentum}` : ""
    const desc = `Heat ${g.heatScore}/100${mom}${growth}. ${g.seller || ""}${g.archetype ? " · " + g.archetype : ""}. ${g.traction === "strong" ? "Strong early traction." : ""}`.trim()
    return `
    <item>
      <title>${escape(`#${i + 1} ${g.name} — heat ${g.heatScore}`)}</title>
      <link>${base}/games/${g.id}/</link>
      <guid isPermaLink="false">${base}/games/${g.id}/#${data.date || ""}</guid>
      <pubDate>${pubDate.toUTCString()}</pubDate>
      <description>${escape(desc)}</description>
    </item>`
  }).join("")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Rising iOS Games — early-traction radar</title>
  <link>${base}/movers/</link>
  <description>The iOS games taking off right now, ranked daily by a heat score built from download velocity, relative growth and chart momentum.</description>
  <lastBuildDate>${pubDate.toUTCString()}</lastBuildDate>
  ${items}
</channel></rss>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml",
      "Cache-Control": "public, max-age=300, s-maxage=900",
    }
  })
}

function escape(s){ return String(s).replace(/[<>&'"]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;" }[c])) }

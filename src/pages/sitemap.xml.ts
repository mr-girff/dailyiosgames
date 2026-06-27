// Hand-rolled sitemap. Avoids the @astrojs/sitemap incompat with Astro 4.x.
import fs from "node:fs"
import path from "node:path"

export async function GET({ site }) {
  const p = path.join(process.cwd(), "data/enriched.json")
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { all: [] }
  const base = (site?.toString() || "https://ios.querygame.com").replace(/\/$/, "")
  const today = new Date().toISOString().slice(0, 10)

  const indexable = (data.all || []).filter(g => g.indexDirective?.startsWith("index"))
  const archetypes = [...new Set(indexable.map(g => g.archetype))]

  const urls = [
    { loc: `${base}/`,             changefreq: "daily",   priority: "1.0", lastmod: today },
    { loc: `${base}/posts/`,       changefreq: "daily",   priority: "0.8", lastmod: today },
    { loc: `${base}/games/`,       changefreq: "daily",   priority: "0.7", lastmod: today },
    { loc: `${base}/archetype/`,   changefreq: "weekly",  priority: "0.6", lastmod: today },
    { loc: `${base}/about/`,       changefreq: "monthly", priority: "0.3", lastmod: today },
    { loc: `${base}/methodology/`, changefreq: "monthly", priority: "0.3", lastmod: today },
  ]
  for (const a of archetypes) urls.push({ loc: `${base}/archetype/${a}/`, changefreq: "daily", priority: "0.6", lastmod: today })
  for (const g of indexable)  urls.push({ loc: `${base}/games/${g.id}/`,  changefreq: "weekly", priority: "0.5", lastmod: g.currentVersionDate || today })
  // Daily posts
  try {
    const postsDir = path.join(process.cwd(), "src/content/posts")
    if (fs.existsSync(postsDir)) {
      for (const f of fs.readdirSync(postsDir)) {
        if (!f.endsWith(".md")) continue
        const slug = f.replace(/\.md$/, "")
        urls.push({ loc: `${base}/posts/${slug}/`, changefreq: "monthly", priority: "0.4", lastmod: slug })
      }
    }
  } catch {}

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    }
  })
}

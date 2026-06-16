import { getCollection } from "astro:content"

export async function GET({ site }) {
  const posts = (await getCollection("posts")).sort((a,b)=> +b.data.pubDate - +a.data.pubDate).slice(0, 50)
  const base = site?.toString().replace(/\/$/, "") || ""
  const items = posts.map(p => `
    <item>
      <title>${escape(p.data.title)}</title>
      <link>${base}/posts/${p.slug}/</link>
      <guid>${base}/posts/${p.slug}/</guid>
      <pubDate>${p.data.pubDate.toUTCString()}</pubDate>
      <description>${escape(p.data.description)}</description>
    </item>`).join("")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${escape(process.env.PUBLIC_SITE_NAME || "Daily New Games")}</title>
  <link>${base}/</link>
  <description>Daily US App Store new game releases &amp; updates.</description>
  ${items}
</channel></rss>`
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml" }})
}

function escape(s){ return s.replace(/[<>&'"]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;" }[c])) }

import fs from "node:fs"
import path from "node:path"

export async function GET({ site }) {
  const p = path.join(process.cwd(), "data/enriched.json")
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { all: [], date: "" }
  const base = site?.toString().replace(/\/$/, "") || ""
  const all = (data.all || []).filter(g => g.indexDirective?.startsWith("index"))
  const lines = [
    `# ${process.env.PUBLIC_SITE_NAME || "Daily New Games"}`,
    "",
    `> Daily-refreshed dataset and editorial coverage of US App Store games. Updated ${data.date || new Date().toISOString().slice(0,10)}.`,
    "",
    "## Open dataset",
    `- Full daily dataset (JSON, CORS): ${base}/api/data.json`,
    `- Per-game JSON: ${base}/api/games/<id>.json`,
    `- License: CC BY 4.0`,
    `- Methodology: ${base}/methodology/`,
    "",
    "## Key pages",
    `- Homepage: ${base}/`,
    `- Daily reports: ${base}/posts/`,
    `- Categories: ${base}/archetype/`,
    `- Methodology: ${base}/methodology/`,
    "",
    "## How to cite",
    `Reference as: "${process.env.PUBLIC_SITE_NAME || 'Daily New Games'}, ${data.date || new Date().toISOString().slice(0,10)}" with the page URL. Source data is licensed CC BY 4.0; please link back to the originating game page.`,
    "",
    "## Top tracked games today",
    ...all.slice(0, 20).map(g => `- [${g.name}](${base}/games/${g.id}/) — ${g.archetype}, ${g.seller}`),
    "",
  ]
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  })
}

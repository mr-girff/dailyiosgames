#!/usr/bin/env node
// Post-build integrity check. Run after `npm run build`.
//
// Catches the class of bug that shipped silently before: internal links pointing
// at pages that are not generated (e.g. /archetype/strategy/ linked from
// /like/clash-royale/), sitemap entries with no page, and missing key routes.
//
// Exit code 1 on any hard failure so CI blocks the merge.

import fs from "node:fs/promises"
import path from "node:path"

const DIST = path.join(process.cwd(), "dist")
const REQUIRED = ["/index.html", "/404.html", "/search/index.html", "/sitemap.xml", "/robots.txt", "/api/data.json", "/search-index.json"]
const SKIP_PREFIX = ["/img/", "/video/", "/api/", "/_astro/"]

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else out.push("/" + path.relative(DIST, p).split(path.sep).join("/"))
  }
  return out
}

const fail = []
const warn = []

async function main() {
  let files
  try { files = await walk(DIST) } catch {
    console.error("check_build: dist/ not found — run `npm run build` first.")
    process.exit(1)
  }
  const set = new Set(files)
  const exists = (u) => set.has(u) || set.has(u + "index.html") || set.has(u + "/index.html")

  for (const r of REQUIRED) if (!set.has(r)) fail.push(`missing required output: ${r}`)

  // Internal link check
  const htmlFiles = files.filter(f => f.endsWith(".html"))
  const broken = new Map()
  for (const f of htmlFiles) {
    const raw = await fs.readFile(path.join(DIST, f), "utf8")
    // Inline <script>/<style> bodies contain URL-looking strings that are built
    // at runtime; only real markup attributes are checked.
    const html = raw.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const u = m[1]
      if (SKIP_PREFIX.some(p => u.startsWith(p))) continue
      if (exists(u)) continue
      if (!broken.has(u)) broken.set(u, new Set())
      broken.get(u).add(f)
    }
  }
  for (const [u, from] of broken) {
    fail.push(`broken internal link ${u} (linked from ${from.size} page(s), e.g. ${[...from][0]})`)
  }

  // Sitemap must only list pages that exist and are not noindex.
  const sitemap = await fs.readFile(path.join(DIST, "sitemap.xml"), "utf8").catch(() => "")
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/^https?:\/\/[^/]+/, ""))
  for (const loc of locs) {
    if (!exists(loc)) { fail.push(`sitemap lists a page with no build output: ${loc}`); continue }
    const file = set.has(loc) ? loc : (set.has(loc + "index.html") ? loc + "index.html" : loc + "/index.html")
    if (file.endsWith(".html")) {
      const html = await fs.readFile(path.join(DIST, file), "utf8")
      if (/<meta name="robots" content="noindex/.test(html)) fail.push(`sitemap lists a noindex page: ${loc}`)
    }
  }

  // Canonical sanity: every indexable page needs exactly one canonical.
  for (const f of htmlFiles) {
    const html = await fs.readFile(path.join(DIST, f), "utf8")
    const n = (html.match(/<link rel="canonical"/g) || []).length
    if (n !== 1) fail.push(`${f}: expected 1 canonical link, found ${n}`)
  }

  console.log(`check_build: ${htmlFiles.length} pages, ${locs.length} sitemap urls, ${broken.size} broken links.`)
  for (const w of warn) console.warn("WARN  " + w)
  for (const f of fail) console.error("FAIL  " + f)
  if (fail.length) process.exit(1)
  console.log("check_build: OK")
}

main().catch(e => { console.error(e); process.exit(1) })

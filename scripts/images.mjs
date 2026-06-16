// Download Apple media → convert to AVIF + WebP → multiple sizes, write to /public/img/<id>/.
// Uses `sharp`. Run after enrich.mjs. Skips already-cached files.
//
//   npm i sharp
//   node scripts/images.mjs

import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "data/enriched.json")
const OUT = path.join(ROOT, "public/img")

const SIZES = {
  icon:       [64, 128, 256, 512],
  screenshot: [400, 800, 1200],
}

async function download(url) {
  const r = await fetch(url, { headers: { "User-Agent": "DailyGameBot/1.0" } })
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

async function emitVariants(buf, baseDir, baseName, sizes) {
  const written = []
  for (const w of sizes) {
    for (const fmt of ["avif", "webp"]) {
      const p = path.join(baseDir, `${baseName}-${w}.${fmt}`)
      try { await fs.access(p); written.push(p); continue } catch {}
      const img = sharp(buf).resize({ width: w, withoutEnlargement: true })
      await (fmt === "avif" ? img.avif({ quality: 55 }) : img.webp({ quality: 80 })).toFile(p)
      written.push(p)
    }
  }
  return written
}

function altIcon(g) { return `${g.name} app icon — ${g.archetype} game by ${g.seller}` }
function altScreenshot(g, i) {
  // Build alt from understanding, not just "screenshot 1"
  const hints = [
    g.archetype && `${g.archetype} gameplay`,
    g.coreLoop && truncate(g.coreLoop, 80),
    g.tags?.length && g.tags.slice(0,2).join(", "),
  ].filter(Boolean).join(" — ")
  return `${g.name} screenshot ${i+1}: ${hints || "in-game view"}`
}
function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s }

async function main() {
  const data = JSON.parse(await fs.readFile(SRC, "utf8"))
  const games = data.all.filter(g => g.indexDirective.startsWith("index")) // only download for indexable pages
  console.log(`Processing ${games.length} indexable games`)
  for (const g of games) {
    const dir = path.join(OUT, g.id)
    await fs.mkdir(dir, { recursive: true })
    const images = { icon: null, screenshots: [] }
    try {
      if (g.icon) {
        const buf = await download(g.icon)
        await emitVariants(buf, dir, "icon", SIZES.icon)
        images.icon = { src: `/img/${g.id}/icon-256.webp`, alt: altIcon(g),
          srcset: SIZES.icon.map(w => `/img/${g.id}/icon-${w}.webp ${w}w`).join(", ") }
      }
      for (let i = 0; i < (g.screenshots || []).slice(0,4).length; i++) {
        const buf = await download(g.screenshots[i])
        await emitVariants(buf, dir, `s${i}`, SIZES.screenshot)
        images.screenshots.push({
          src: `/img/${g.id}/s${i}-800.webp`,
          alt: altScreenshot(g, i),
          srcset: SIZES.screenshot.map(w => `/img/${g.id}/s${i}-${w}.webp ${w}w`).join(", "),
          sources: {
            avif: SIZES.screenshot.map(w => `/img/${g.id}/s${i}-${w}.avif ${w}w`).join(", "),
            webp: SIZES.screenshot.map(w => `/img/${g.id}/s${i}-${w}.webp ${w}w`).join(", "),
          }
        })
      }
      g.images = images
    } catch (e) {
      console.warn(`Image failed for ${g.name}:`, e.message)
    }
  }
  await fs.writeFile(SRC, JSON.stringify(data, null, 2))
  console.log("Images done.")
}

main().catch(e => { console.error(e); process.exit(1) })

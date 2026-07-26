// Rasterise every SVG used as an Open Graph image into a 1200x630 PNG.
//
// Why: Facebook, X/Twitter, LinkedIn, Slack, Discord and iMessage all ignore
// `og:image` values that point at an SVG, so the whole site was shipping link
// previews with no image at all. Base.astro rewrites `*.svg` OG values to the
// `.png` sibling produced here.
//
// Run: npm run og   (idempotent — skips PNGs newer than their source SVG)

import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = process.cwd()
const PUBLIC = path.join(ROOT, "public")
const W = 1200, H = 630
const BG = "#faf7f2" // matches the site background

// Only files that are actually referenced as og:image sources.
const DIRS = [PUBLIC, path.join(PUBLIC, "illus")]

async function mtime(p) {
  try { return (await fs.stat(p)).mtimeMs } catch { return 0 }
}

async function main() {
  let made = 0, skipped = 0
  for (const dir of DIRS) {
    let entries = []
    try { entries = await fs.readdir(dir) } catch { continue }
    for (const f of entries) {
      if (!f.endsWith(".svg")) continue
      if (f === "favicon.svg" || f.startsWith("decor-")) continue
      const src = path.join(dir, f)
      const dst = src.replace(/\.svg$/, ".png")
      if (await mtime(dst) >= await mtime(src)) { skipped++; continue }
      const buf = await fs.readFile(src)
      await sharp(buf, { density: 200 })
        .resize({ width: W, height: H, fit: "contain", background: BG })
        .flatten({ background: BG })
        .png({ compressionLevel: 9, palette: true })
        .toFile(dst)
      made++
      console.log(`og: ${path.relative(ROOT, dst)}`)
    }
  }
  console.log(`OG images: ${made} generated, ${skipped} up to date.`)
}

main().catch(e => { console.error(e); process.exit(1) })

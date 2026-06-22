// Download Apple media → convert to AVIF + WebP → multiple sizes.
// Two modes:
//   • R2 mode (when CF_API_TOKEN + CF_ACCOUNT_ID are set): upload variants to
//     Cloudflare R2 via the REST API and write absolute public URLs into
//     enriched.json. Nothing is written to the repo — keeps git lean.
//   • Local mode (no creds, e.g. local dev): write to /public/img/<id>/ as before.
// Skips work that already exists (R2: public HEAD check; local: file access).

import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "data/enriched.json")
const OUT = path.join(ROOT, "public/img")

const CF_TOKEN  = process.env.CF_API_TOKEN
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID
const R2_BUCKET = process.env.R2_BUCKET || "dailyiosgames-img"
const R2_BASE   = (process.env.R2_PUBLIC_BASE || "https://pub-b0c2b55b591943618afb4f9570138e61.r2.dev").replace(/\/$/, "")
const USE_R2 = !!(CF_TOKEN && CF_ACCOUNT)

const SIZES = {
  icon:       [64, 128, 256, 512],
  screenshot: [400, 800, 1200],
}
const CT = { avif: "image/avif", webp: "image/webp" }

async function download(url) {
  const r = await fetch(url, { headers: { "User-Agent": "DailyGameBot/1.0" } })
  if (!r.ok) throw new Error(`${url} ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

async function r2Exists(key) {
  try {
    const r = await fetch(`${R2_BASE}/${key}`, { method: "HEAD" })
    return r.ok
  } catch { return false }
}

async function r2Put(key, buf, fmt) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/r2/buckets/${R2_BUCKET}/objects/${key}`
  const r = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${CF_TOKEN}`, "Content-Type": CT[fmt] },
    body: buf,
  })
  if (!r.ok) throw new Error(`R2 PUT ${key} -> ${r.status} ${await r.text().catch(()=> "")}`)
}

// Produces the variant set for one source image and returns the URL prefix used
// in src/srcset (root-relative for local mode, absolute for R2 mode).
async function emitVariants(buf, id, baseName, sizes) {
  for (const w of sizes) {
    for (const fmt of ["avif", "webp"]) {
      if (USE_R2) {
        const key = `img/${id}/${baseName}-${w}.${fmt}`
        if (await r2Exists(key)) continue
        const img = sharp(buf).resize({ width: w, withoutEnlargement: true })
        const out = await (fmt === "avif" ? img.avif({ quality: 55 }) : img.webp({ quality: 80 })).toBuffer()
        await r2Put(key, out, fmt)
      } else {
        const dir = path.join(OUT, id)
        await fs.mkdir(dir, { recursive: true })
        const p = path.join(dir, `${baseName}-${w}.${fmt}`)
        try { await fs.access(p); continue } catch {}
        const img = sharp(buf).resize({ width: w, withoutEnlargement: true })
        await (fmt === "avif" ? img.avif({ quality: 55 }) : img.webp({ quality: 80 })).toFile(p)
      }
    }
  }
}

// URL builder honoring the active mode.
const urlFor = (id, name, w, fmt) => USE_R2 ? `${R2_BASE}/img/${id}/${name}-${w}.${fmt}` : `/img/${id}/${name}-${w}.${fmt}`

function altIcon(g) { return `${g.name} app icon — ${g.archetype} game by ${g.seller}` }
function altScreenshot(g, i) {
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
  const games = data.all.filter(g => g.indexDirective.startsWith("index")) // only for indexable pages
  console.log(`Processing ${games.length} indexable games (${USE_R2 ? "R2: " + R2_BUCKET : "local public/img"})`)
  let ok = 0
  for (const g of games) {
    const images = { icon: null, screenshots: [] }
    try {
      if (g.icon) {
        const buf = await download(g.icon)
        await emitVariants(buf, g.id, "icon", SIZES.icon)
        images.icon = {
          src: urlFor(g.id, "icon", 256, "webp"),
          alt: altIcon(g),
          srcset: SIZES.icon.map(w => `${urlFor(g.id, "icon", w, "webp")} ${w}w`).join(", "),
        }
      }
      for (let i = 0; i < (g.screenshots || []).slice(0,4).length; i++) {
        const buf = await download(g.screenshots[i])
        await emitVariants(buf, g.id, `s${i}`, SIZES.screenshot)
        images.screenshots.push({
          src: urlFor(g.id, `s${i}`, 800, "webp"),
          alt: altScreenshot(g, i),
          srcset: SIZES.screenshot.map(w => `${urlFor(g.id, `s${i}`, w, "webp")} ${w}w`).join(", "),
          sources: {
            avif: SIZES.screenshot.map(w => `${urlFor(g.id, `s${i}`, w, "avif")} ${w}w`).join(", "),
            webp: SIZES.screenshot.map(w => `${urlFor(g.id, `s${i}`, w, "webp")} ${w}w`).join(", "),
          }
        })
      }
      g.images = images
      ok++
    } catch (e) {
      console.warn(`Image failed for ${g.name}:`, e.message)
    }
  }
  await fs.writeFile(SRC, JSON.stringify(data, null, 2))
  console.log(`Images done. ${ok}/${games.length} games processed.`)
}

main().catch(e => { console.error(e); process.exit(1) })

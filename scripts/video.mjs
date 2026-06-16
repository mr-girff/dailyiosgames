// Generate a 15-second gameplay teaser per indexable game.
// Uses local screenshots (already downloaded by images.mjs) + edge-tts voiceover + ffmpeg.
// Output: /public/video/<id>/teaser.mp4  +  /public/video/<id>/poster.jpg
//
// Requires: ffmpeg in PATH and `npm i -D edge-tts node-edge-tts` OR system `edge-tts` python.
// We shell out so the JS code stays dependency-light.
//
//   sudo apt-get install -y ffmpeg
//   pip install edge-tts   # provides the `edge-tts` CLI (free, Microsoft Edge voices)
//   node scripts/video.mjs

import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const sh = promisify(execFile)

const ROOT = process.cwd()
const SRC  = path.join(ROOT, "data/enriched.json")
const OUT  = path.join(ROOT, "public/video")
const IMG  = path.join(ROOT, "public/img")
const FPS  = 30
const SEC_PER_SHOT = 3.5  // 4 shots × 3.5s ≈ 14s, fits typical 15s budget
const VOICE = process.env.TTS_VOICE || "en-US-AriaNeural"

function script(game) {
  // 3 short beats, ~30 words total → ~14s at normal pace
  const beat1 = `${game.name}, a ${humanize(game.archetype)} by ${game.seller}.`
  const beat2 = game.uniqueHook ? trim(game.uniqueHook, 90) : (game.coreLoop ? trim(game.coreLoop, 90) : `A new release on the US App Store.`)
  const beat3 = `Sessions run about ${game.sessionLength}. ${game.monetization === "premium" ? "Premium, one-time purchase." : "Free with in-app purchases."}`
  return [beat1, beat2, beat3].join(" ")
}
function humanize(a){ return (a||"").replace(/-/g," ") }
function trim(s,n){ return s.length>n ? s.slice(0,n-1)+"…" : s }

async function exists(p){ try { await fs.access(p); return true } catch { return false } }

async function ttsToFile(text, outWav) {
  // Uses the `edge-tts` Python CLI. Free, no key.
  // Format: edge-tts --voice <v> --text "..." --write-media out.mp3
  const outMp3 = outWav.replace(/\.wav$/, ".mp3")
  await sh("edge-tts", ["--voice", VOICE, "--text", text, "--write-media", outMp3, "--rate", "+5%"])
  return outMp3
}

async function buildClip(game) {
  const id = game.id
  const dir = path.join(OUT, id)
  await fs.mkdir(dir, { recursive: true })
  const out = path.join(dir, "teaser.mp4")
  const poster = path.join(dir, "poster.jpg")
  if (await exists(out)) return { mp4: `/video/${id}/teaser.mp4`, poster: `/video/${id}/poster.jpg`, cached: true }

  // Pick up to 4 screenshots at 1200w (we downloaded these earlier as webp)
  const shots = []
  for (let i = 0; i < 4; i++) {
    const webp = path.join(IMG, id, `s${i}-1200.webp`)
    if (await exists(webp)) shots.push(webp)
  }
  if (shots.length < 2) return null // not enough media

  // 1) Synthesize narration
  const narration = path.join(dir, "voice.mp3")
  if (!(await exists(narration))) {
    try { await ttsToFile(script(game), narration) }
    catch (e) { console.warn(`TTS failed for ${game.name}: ${e.message}`); return null }
  }

  // 2) Build a Ken-Burns slideshow with ffmpeg
  //    Each screenshot: zoom 1.0→1.08 over SEC_PER_SHOT, crossfade 0.4s between shots.
  const inputs = shots.flatMap(s => ["-loop", "1", "-t", String(SEC_PER_SHOT), "-i", s])
  // Build filter_complex
  const N = shots.length
  const total = N * SEC_PER_SHOT
  const scale = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`
  const labels = shots.map((_, i) =>
    `[${i}:v]${scale},zoompan=z='min(zoom+0.0015,1.08)':d=${Math.round(SEC_PER_SHOT*FPS)}:s=1080x1920:fps=${FPS}[v${i}]`
  ).join(";")
  let chain = `[v0]`
  for (let i = 1; i < N; i++) {
    const offset = (SEC_PER_SHOT * i - 0.4).toFixed(2)
    chain += `[v${i}]xfade=transition=fade:duration=0.4:offset=${offset}[x${i}]`
    if (i < N - 1) chain += `;[x${i}]`
  }
  const finalV = N > 1 ? `[x${N-1}]` : `[v0]`
  const filter = `${labels};${chain.startsWith("[v0]") ? chain.slice(4) : chain}`

  const args = [
    ...inputs,
    "-i", narration,
    "-filter_complex", filter,
    "-map", finalV, "-map", `${N}:a`,
    "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-y", out,
  ]
  try { await sh("ffmpeg", args, { maxBuffer: 50e6 }) }
  catch (e) { console.warn(`ffmpeg failed for ${game.name}: ${e.message}`); return null }

  // 3) Extract poster frame
  try {
    await sh("ffmpeg", ["-y", "-ss", "1.5", "-i", out, "-frames:v", "1", "-q:v", "3", poster])
  } catch {}

  return { mp4: `/video/${id}/teaser.mp4`, poster: `/video/${id}/poster.jpg`, durationSec: Math.round(total) }
}

async function main() {
  const data = JSON.parse(await fs.readFile(SRC, "utf8"))
  const games = data.all.filter(g => g.indexDirective?.startsWith("index"))
  console.log(`Building teaser videos for ${games.length} games`)
  let ok = 0
  for (const g of games) {
    const v = await buildClip(g)
    if (v) { g.video = v; ok++; if (!v.cached) console.log(`✓ ${g.name}`) }
  }
  await fs.writeFile(SRC, JSON.stringify(data, null, 2))
  console.log(`Done. ${ok}/${games.length} videos available.`)
}

main().catch(e => { console.error(e); process.exit(1) })

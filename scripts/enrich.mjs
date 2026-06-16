// Game understanding layer.
// Reads data/latest.json, classifies each game (rules + optional LLM), writes data/enriched.json.
// Run after fetch_daily.mjs. Designed to be cheap & dependency-free; LLM call is optional.

import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const SRC = path.join(ROOT, "data/latest.json")
const DST = path.join(ROOT, "data/enriched.json")

// ─── 1. Rule-based archetype detector ───────────────────────────────
const ARCHETYPES = [
  { key: "match3",       any: ["match-3", "match 3", "matching", "swap", "blast", "crush", "candy", "jewel"] },
  { key: "merge",        any: ["merge ", "merging", "combine to evolve"] },
  { key: "puzzle-word",  any: ["word", "anagram", "spelling", "letters", "vocabulary"] },
  { key: "puzzle-logic", any: ["sudoku", "nonogram", "picross", "logic puzzle"] },
  { key: "idle",         any: ["idle", "tap to earn", "auto-clicker", "afk", "tycoon"] },
  { key: "rpg",          any: ["rpg", "role-playing", "hero", "guild", "raid", "loot"] },
  { key: "roguelike",    any: ["roguelike", "roguelite", "permadeath", "run-based"] },
  { key: "racing",       any: ["racing", "race", "drift", "kart"] },
  { key: "casino",       any: ["slot", "casino", "poker", "bingo", "blackjack", "jackpot"] },
  { key: "sim",          any: ["simulation", "manage", "build your", "city builder", "farm"] },
  { key: "shooter",      any: ["shooter", "fps", "gunfight", "battle royale"] },
  { key: "platformer",   any: ["platformer", "jump and run"] },
  { key: "card",         any: ["card game", "deckbuilder", "ccg", "tcg"] },
  { key: "sports",       any: ["football", "soccer", "basketball", "tennis", "golf game"] },
  { key: "social-deduction", any: ["impostor", "social deduction"] },
  { key: "casual-arcade", any: ["arcade", "endless runner", "tap to play"] },
]

function detectArchetype(text) {
  const t = (text || "").toLowerCase()
  for (const a of ARCHETYPES) {
    if (a.any.some(k => t.includes(k))) return a.key
  }
  return "casual-arcade"
}

const MONETIZATION_HINTS = {
  premium:     /\bno ads\b|\bpremium\b|\bpaid\b|\bbuy once\b/i,
  subscription:/\bsubscription\b|\bsubscribe\b|\bweekly\b.{0,10}\$|\bmonthly\b.{0,10}\$/i,
  iapAds:      /\bin-app purchase\b|\bin app purchase\b|\biap\b|\bads\b/i,
}

function detectMonetization(g) {
  const t = (g.desc || "") + " " + (g.releaseNotes || "")
  if (g.price && g.price !== "Free") return "premium"
  for (const [k, re] of Object.entries(MONETIZATION_HINTS)) if (re.test(t)) return k
  return "iapAds"
}

const FEATURE_FLAGS = [
  { tag: "offline",        re: /\boffline\b|\bno internet\b|\bno wifi\b/i },
  { tag: "no-ads",         re: /\bno ads\b|\bad-free\b|\bad free\b/i },
  { tag: "family-safe",    re: /\bfamily\b|\bkid[- ]?friendly\b|\bage 4\+\b|\bage 9\+\b/i },
  { tag: "controller",     re: /\bcontroller\b|\bmfi\b|\bgamepad\b/i },
  { tag: "multiplayer",    re: /\bmultiplayer\b|\b1v1\b|\bversus\b|\bonline pvp\b/i },
  { tag: "co-op",          re: /\bco[- ]?op\b|\bcoop\b/i },
  { tag: "cloud-save",     re: /\bcloud save\b|\bicloud sync\b/i },
  { tag: "ipad-optimized", re: /\bipad\b/i },
  { tag: "vision-pro",     re: /\bvision pro\b|\bspatial\b/i },
]

function detectFeatures(g) {
  const t = (g.desc || "") + " " + (g.releaseNotes || "")
  return FEATURE_FLAGS.filter(f => f.re.test(t)).map(f => f.tag)
}

// Core loop: first 2 short sentences of description, cleaned
function extractCoreLoop(g) {
  const s = (g.desc || "").split(/(?<=[.!?])\s+/).filter(x => x.length > 20 && x.length < 200)
  return s.slice(0, 2).join(" ").slice(0, 240) || null
}

// Session length guess from genre + archetype
function guessSessionLength(arch) {
  return ({
    match3: "3–5 min", merge: "5–10 min", "puzzle-word": "2–4 min", "puzzle-logic": "5–15 min",
    idle: "30s check-ins", rpg: "15–30 min", roguelike: "10–20 min/run", racing: "2–4 min/race",
    casino: "open-ended", sim: "10–30 min", shooter: "5–10 min/match", platformer: "5–15 min",
    card: "10–20 min", sports: "5–15 min", "social-deduction": "10 min/round", "casual-arcade": "1–3 min",
  })[arch] || "5 min"
}

// Audience guess (rough heuristic; safe defaults)
function guessAudience(arch, g) {
  const t = (g.desc || "").toLowerCase()
  if (arch === "match3" || arch === "merge") return "casual players, 25–55, prefer relaxing single-player loops"
  if (arch === "casino") return "adults 21+, slots & social-casino fans"
  if (arch === "rpg" || arch === "roguelike") return "midcore players, 18–35, gacha/strategy comfortable"
  if (arch === "puzzle-word") return "word-game fans, 35+"
  if (arch === "racing" || arch === "shooter") return "younger action-game players, 13–30"
  if (/\bkid|child|toddler|preschool|baby\b/.test(t)) return "kids 4–9 and their parents"
  return "general mobile gaming audience"
}

// Unique hook: rough — first sentence containing 'unlike', 'first', 'only', or strong adjective
function findHook(g) {
  const sents = (g.desc || "").split(/(?<=[.!?])\s+/)
  const hooked = sents.find(s => /\b(unlike|first|only|unique|new way|never been|reinvent|revolutionary)\b/i.test(s))
  return hooked ? hooked.slice(0, 220) : null
}

// Red flags: things players complain about
function findRedFlags(g) {
  const t = ((g.desc || "") + " " + (g.releaseNotes || "")).toLowerCase()
  const flags = []
  if (/\benergy\b|\blives system\b|\bstamina\b/.test(t)) flags.push("energy/lives gating")
  if (/\bgacha\b|\bloot box\b|\brandom rewards\b/.test(t)) flags.push("gacha mechanics")
  if (/\bpay to win\b|\bp2w\b/.test(t)) flags.push("pay-to-win complaints likely")
  if (/\bsubscription required\b|\bmust subscribe\b/.test(t)) flags.push("subscription gate")
  if (/\binternet required\b|\balways online\b/.test(t)) flags.push("requires internet")
  if (g.size_mb && g.size_mb > 1500) flags.push(`large download (${g.size_mb} MB)`)
  return flags
}

// ─── 2. Optional LLM polish (only on high-signal games) ─────────────
async function llmEnrich(game, env) {
  if (!env.OPENAI_API_KEY) return null
  const system = "You analyze mobile games for an editorial site. Return strict JSON only."
  const user = `Given this iOS game, return JSON with keys: archetype, coreLoop (≤25 words), uniqueHook (≤25 words), competitors (up to 3 well-known game names), targetAudience (≤15 words), designPalette (one of: candy, neon, dark-pixel, gold-casino, pastel, military, cozy-warm, sci-fi-cool), heroLayout (one of: grid-tiles, character-card, isometric, screenshot-carousel, action-still).

Game: ${game.name}
Developer: ${game.seller}
Genres: ${(game.genres||[]).join(", ")}
Description: ${(game.desc||"").slice(0, 800)}
Release notes: ${(game.releaseNotes||"").slice(0, 300)}`

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.4,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    })
    if (!r.ok) return null
    const j = await r.json()
    return JSON.parse(j.choices[0].message.content)
  } catch { return null }
}

// ─── 3. Similar-games clustering (deterministic, no LLM) ────────────
function buildSimilarity(games) {
  // simple Jaccard on (archetype + tags + genres)
  return games.map(g => {
    const set = new Set([g.archetype, ...(g.tags||[]), ...(g.genres||[])])
    const scored = games
      .filter(o => o.id !== g.id)
      .map(o => {
        const oset = new Set([o.archetype, ...(o.tags||[]), ...(o.genres||[])])
        const inter = [...set].filter(x => oset.has(x)).length
        const union = new Set([...set, ...oset]).size || 1
        return { id: o.id, name: o.name, score: inter / union }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return { id: g.id, similar: scored }
  })
}

// ─── 4. Index decision (avoid programmatic doorway penalty) ─────────
function indexDecision(g) {
  // index only if there's real signal OR meaningful content
  const signal = g.signal || 0
  const hasReviews = (g.ratingCount || 0) >= 20
  const hasContent = (g.desc || "").length > 400
  if (signal >= 8 || hasReviews) return "index,follow"
  if (hasContent && signal >= 3) return "index,follow"
  return "noindex,follow" // keep crawl path open but don't pollute SERP
}

// ─── 5. Main ────────────────────────────────────────────────────────
async function main() {
  const raw = JSON.parse(await fs.readFile(SRC, "utf8"))
  const env = process.env
  const useLLM = !!env.OPENAI_API_KEY && env.ENRICH_USE_LLM !== "0"

  const all = [...(raw.newReleases || []), ...(raw.updates || [])]
  for (const g of all) {
    const haystack = (g.desc || "") + " " + (g.releaseNotes || "") + " " + (g.genres || []).join(" ")
    g.archetype     = detectArchetype(haystack)
    g.monetization  = detectMonetization(g)
    g.tags          = detectFeatures(g)
    g.coreLoop      = extractCoreLoop(g)
    g.sessionLength = guessSessionLength(g.archetype)
    g.audience      = guessAudience(g.archetype, g)
    g.uniqueHook    = findHook(g)
    g.redFlags      = findRedFlags(g)
    g.indexDirective = indexDecision(g)

    // Only call LLM on indexable, high-signal games (budget control)
    if (useLLM && g.indexDirective.startsWith("index") && (g.signal || 0) >= 8) {
      const polish = await llmEnrich(g, env)
      if (polish) {
        g.archetype     = polish.archetype || g.archetype
        g.coreLoop      = polish.coreLoop || g.coreLoop
        g.uniqueHook    = polish.uniqueHook || g.uniqueHook
        g.competitors   = polish.competitors || []
        g.audience      = polish.targetAudience || g.audience
        g.designPalette = polish.designPalette || defaultPalette(g.archetype)
        g.heroLayout    = polish.heroLayout || defaultHero(g.archetype)
        g.llmEnriched   = true
      }
    }
    if (!g.designPalette) g.designPalette = defaultPalette(g.archetype)
    if (!g.heroLayout)    g.heroLayout    = defaultHero(g.archetype)
  }

  const similarity = buildSimilarity(all)
  const simMap = Object.fromEntries(similarity.map(s => [s.id, s.similar]))

  for (const g of all) g.similar = simMap[g.id] || []

  const out = { ...raw, enrichedAt: new Date().toISOString(), all }
  await fs.writeFile(DST, JSON.stringify(out, null, 2))
  console.log(`Enriched ${all.length} games. Indexable: ${all.filter(g=>g.indexDirective.startsWith("index")).length}`)
}

function defaultPalette(arch) {
  return ({
    match3: "candy", merge: "pastel", "puzzle-word": "cozy-warm", "puzzle-logic": "cozy-warm",
    idle: "neon", rpg: "dark-pixel", roguelike: "dark-pixel", racing: "neon",
    casino: "gold-casino", sim: "pastel", shooter: "military", platformer: "candy",
    card: "dark-pixel", sports: "neon", "social-deduction": "neon", "casual-arcade": "candy",
  })[arch] || "pastel"
}
function defaultHero(arch) {
  return ({
    match3: "grid-tiles", merge: "grid-tiles", "puzzle-word": "grid-tiles", "puzzle-logic": "grid-tiles",
    idle: "isometric", rpg: "character-card", roguelike: "character-card", racing: "action-still",
    casino: "screenshot-carousel", sim: "isometric", shooter: "action-still", platformer: "action-still",
    card: "character-card", sports: "action-still", "social-deduction": "character-card", "casual-arcade": "screenshot-carousel",
  })[arch] || "screenshot-carousel"
}

main().catch(e => { console.error(e); process.exit(1) })

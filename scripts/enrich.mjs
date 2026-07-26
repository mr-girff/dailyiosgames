// Game understanding layer.
// Reads data/latest.json + the persistent catalogue (every game ever seen),
// classifies each game (rules + optional LLM), writes data/enriched.json.
// Run after fetch_daily.mjs. Designed to be cheap & dependency-free; LLM call is optional.
//
// The catalogue is what keeps /games/<id>/ URLs alive after a game drops off the
// charts: stale entries stay in `all` (marked inactive + noindex) instead of
// vanishing from the build and 404-ing.

import fs from "node:fs/promises"
import path from "node:path"
import { buildCatalog } from "./lib/catalog.mjs"
import { detectArchetype } from "./lib/classify.mjs"
import { serialize } from "./lib/json.mjs"

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const SRC = path.join(ROOT, "data/latest.json")
const DST = path.join(ROOT, "data/enriched.json")

// A game that has not been on any tracked chart for this long stops being
// indexable (page stays online, so no 404 and no lost inbound links).
const STALE_DAYS = 21
const DAY_MS = 86400000

/** Whole days between two YYYY-MM-DD dates; 0 when either is missing/invalid. */
function daysSince(from, to) {
  if (!from || !to) return 0
  const d = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
  return Number.isFinite(d) ? Math.max(0, d) : 0
}

// Fields that were part of the original "should I build a site for this game?"
// experiment and are not rendered anywhere. Dropped from the output to keep the
// daily git diff small.
const DROP_FIELDS = ["googleSuggest", "youtubeSuggest", "domains", "designPalette", "heroLayout"]

// "premium" means one thing on this site: you pay once, up front. It is the
// filter behind /no-iap/ and /no-ads-no-iap/ ("pay once and own it").
//
// The old version also awarded "premium" to any *free* listing whose copy
// contained "no ads", "premium", "paid" or "buy once" — so 25 of the 33 premium
// games in the dataset were free-to-play, including Slotomania, Jackpot World
// and "Triumph: Play for Cash". Casino apps were being presented as pay-once
// titles with no gem packs. Only the price decides "premium" now.
const SUBSCRIPTION_RE = /\bsubscription\b|\bsubscribe\b|\bweekly\b.{0,10}\$|\bmonthly\b.{0,10}\$/i
const AD_FREE_RE = /\bno ads\b|\bad[- ]free\b|\bwithout ads\b/i
const IAP_ADS_RE = /\bin-app purchase\b|\bin app purchase\b|\biap\b|\bads\b/i

function detectMonetization(g) {
  const t = (g.desc || "") + " " + (g.releaseNotes || "")
  if (g.price && g.price !== "Free" && g.price !== "0") return "premium"
  if (SUBSCRIPTION_RE.test(t)) return "subscription"
  // Check ad-free before the IAP/ads hint: /\bads\b/ also matches "no ads".
  if (AD_FREE_RE.test(t) && !IAP_ADS_RE.test(t.replace(AD_FREE_RE, ""))) return "free"
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
    strategy: "15–40 min",
  })[arch] || "5 min"
}

// Audience guess (rough heuristic; safe defaults)
function guessAudience(arch, g) {
  const t = (g.desc || "").toLowerCase()
  if (arch === "match3" || arch === "merge") return "casual players, 25–55, prefer relaxing single-player loops"
  if (arch === "casino") return "adults 21+, slots & social-casino fans"
  if (arch === "rpg" || arch === "roguelike" || arch === "strategy") return "midcore players, 18–35, gacha/strategy comfortable"
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
  const user = `Given this iOS game, return JSON with keys: archetype, coreLoop (≤25 words), uniqueHook (≤25 words), competitors (up to 3 well-known game names), targetAudience (≤15 words).

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
//
// Two properties matter as much as relevance here:
//
//   * Stability. The old version scored plain Jaccard over
//     {archetype, tags, genres} and sorted on the raw float. Ties were extremely
//     common (dozens of match-3 games share an identical tag set), so the winner
//     was decided by the input order — which is catalogue order and changes every
//     day. Every game's "similar" block reshuffled daily: ~1900 lines of pure
//     noise in each data commit, and readers saw the related list churn for no
//     reason. Score is rounded and ties break on id, so the list only moves when
//     the underlying tags actually move.
//   * Weight. A shared archetype means much more than a shared genre string
//     ("Games" is on literally everything), so the components are weighted
//     instead of thrown into one flat set.
function similarityScore(a, b) {
  const tagSet = x => new Set([...(x.tags || []), ...(x.genres || [])])
  const at = tagSet(a), bt = tagSet(b)
  const inter = [...at].filter(x => bt.has(x)).length
  const union = new Set([...at, ...bt]).size || 1
  let s = inter / union
  if (a.archetype && a.archetype === b.archetype) s += 1.5
  if (a.monetization && a.monetization === b.monetization) s += 0.25
  if (a.seller && a.seller === b.seller) s += 0.5
  return Math.round(s * 1000) / 1000
}

function buildSimilarity(games) {
  return games.map(g => {
    const similar = games
      .filter(o => o.id !== g.id)
      .map(o => ({ id: o.id, score: similarityScore(g, o) }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
      .slice(0, 8)
      .filter(s => s.score > 0)
      // Ids only: the name was a duplicate of the catalogue entry (and churned
      // whenever a developer retitled a game), the score was never rendered.
      .map(s => s.id)
    return { id: g.id, similar }
  })
}

// ─── 4. Index decision (avoid programmatic doorway penalty) ─────────
function indexDecision(g, refDate) {
  // Long-stale entries are kept online for link preservation but dropped from
  // the index (and from the sitemap) instead of being deleted.
  // Derived from lastSeen rather than a stored daysSinceSeen: see catalog.mjs.
  if (daysSince(g.lastSeen, refDate) > STALE_DAYS) return "noindex,follow"
  // index only if there's real signal OR meaningful content
  const demand = g.searchDemand || 0
  const hasReviews = (g.ratingCount || 0) >= 20
  const hasContent = (g.desc || "").length > 400
  if (demand >= 8 || hasReviews) return "index,follow"
  if (hasContent && demand >= 3) return "index,follow"
  return "noindex,follow" // keep crawl path open but don't pollute SERP
}

// ─── 5. Main ────────────────────────────────────────────────────────
async function main() {
  const raw = JSON.parse(await fs.readFile(SRC, "utf8"))
  const env = process.env
  const useLLM = !!env.OPENAI_API_KEY && env.ENRICH_USE_LLM !== "0"

  // Previous run's output: source of carried-over images / video / trends / LLM polish.
  let previous = null
  try { previous = JSON.parse(await fs.readFile(DST, "utf8")) } catch {}

  const { games: all, today, stats } = await buildCatalog({
    dataDir: DATA_DIR,
    today: raw.date,
    carryFrom: previous,
  })

  for (const g of all) {
    for (const f of DROP_FIELDS) delete g[f]
    g.archetype     = detectArchetype(g)
    g.monetization  = detectMonetization(g)
    g.tags          = detectFeatures(g)
    g.coreLoop      = extractCoreLoop(g)
    g.sessionLength = guessSessionLength(g.archetype)
    g.audience      = guessAudience(g.archetype, g)
    g.uniqueHook    = findHook(g)
    g.redFlags      = findRedFlags(g)
    g.indexDirective = indexDecision(g, today)

    // Only call LLM on active, indexable, high-signal games (budget control).
    // Archived entries are never re-sent to the LLM: their polish is carried
    // forward by the catalogue instead.
    if (useLLM && g.active && !g.llmEnriched && g.indexDirective.startsWith("index") && (g.searchDemand || 0) >= 8) {
      const polish = await llmEnrich(g, env)
      if (polish) {
        g.archetype     = polish.archetype || g.archetype
        g.coreLoop      = polish.coreLoop || g.coreLoop
        g.uniqueHook    = polish.uniqueHook || g.uniqueHook
        g.competitors   = polish.competitors || []
        g.audience      = polish.targetAudience || g.audience
        g.llmEnriched   = true
      }
    }
  }

  // Similar-games links are only drawn between games that are still indexable,
  // so detail pages never point at an archived, noindexed page.
  const linkable = all.filter(g => g.indexDirective.startsWith("index"))
  const simMap = Object.fromEntries(buildSimilarity(linkable).map(s => [s.id, s.similar]))
  for (const g of all) g.similar = simMap[g.id] || []

  const out = {
    ...raw,
    enrichedAt: new Date().toISOString(),
    catalog: { referenceDate: today, ...stats },
    all,
  }
  await fs.writeFile(DST, serialize(out))
  console.log(
    `Enriched ${all.length} catalogue games (${stats.active} active today, ` +
    `${stats.snapshots} snapshots). Indexable: ${all.filter(g => g.indexDirective.startsWith("index")).length}`,
  )
}

main().catch(e => { console.error(e); process.exit(1) })

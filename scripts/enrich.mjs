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

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const SRC = path.join(ROOT, "data/latest.json")
const DST = path.join(ROOT, "data/enriched.json")

// A game that has not been on any tracked chart for this long stops being
// indexable (page stays online, so no 404 and no lost inbound links).
const STALE_DAYS = 21

// Fields that were part of the original "should I build a site for this game?"
// experiment and are not rendered anywhere. Dropped from the output to keep the
// daily git diff small.
const DROP_FIELDS = ["googleSuggest", "youtubeSuggest", "domains", "designPalette", "heroLayout"]

// ─── 1. Archetype detector ──────────────────────────────────────────
//
// This used to be "first archetype with any substring hit wins", scanning the
// whole marketing description with very loose keywords ("blast", "crush",
// "matching", "swap", "hero", "race"). The result: 101 of 393 games (26%) were
// labelled `match3`, including a sniper shooter, a football card collector and
// several RPGs — and that label drives the page title, the category page, the
// session-length estimate and the similar-games graph.
//
// Now: weighted evidence. Word-boundary keyword matches are scored (a hit in the
// *title* counts more than one buried in the description) and Apple's own
// secondary genre acts as a prior, with a per-genre fallback when the description
// carries no mechanical signal at all.

const TITLE_WEIGHT = 3
const BODY_WEIGHT = 1
const GENRE_PRIOR = 3
const MIN_CONFIDENCE = 3

// Keyword sets are deliberately specific: a word must describe a mechanic, not
// just appear in ad copy.
const ARCHETYPE_KEYWORDS = {
  match3: ["match[ -]?3", "match three", "tile[ -]?match\\w*", "matching puzzle", "swap (?:and|&) match",
    "candy", "jewel\\w*", "gem\\w* (?:blast|crush)", "bubble (?:shoot\\w*|pop)", "blast puzzle",
    "block blast", "block puzzle", "color(?:ed)? blocks?"],
  merge: ["\\bmerge\\b", "\\bmerging\\b", "merge (?:2|two|and)", "combine\\b.{0,15}\\bevolve"],
  "puzzle-word": ["word game", "word puzzle", "word search", "crossword", "anagram", "spelling",
    "vocabulary", "wordle", "letter tiles", "guess the word"],
  "puzzle-logic": ["sudoku", "nonogram", "picross", "logic puzzle", "jigsaw", "mahjong",
    "brain teaser", "escape room", "hidden object", "physics puzzle", "sort\\w* puzzle",
    "water sort", "nuts and bolts", "pin puzzle"],
  idle: ["\\bidle\\b", "incremental game", "\\bafk\\b", "tap to earn", "auto[ -]?clicker",
    "\\bclicker\\b", "idle tycoon", "offline earnings"],
  rpg: ["\\brpg\\b", "role[ -]?playing", "turn[ -]?based (?:battle|combat|rpg)", "\\bguild\\b",
    "\\bgacha\\b", "summon (?:heroes|characters)", "hero collect\\w*", "raid boss", "skill tree",
    "level up your (?:hero|character)"],
  roguelike: ["roguelike", "rogue[ -]?lite", "permadeath", "run[ -]based", "deck[ -]?build\\w*",
    "each run", "procedurally generated"],
  racing: ["\\bracing\\b", "race track", "\\bdrift\\w*", "\\bkart\\b", "drag racing", "car racing",
    "\\bpit stop\\b", "lap times?"],
  casino: ["slot machine", "\\bslots\\b", "\\bcasino\\b", "\\bpoker\\b", "\\bbingo\\b", "blackjack",
    "\\bjackpot\\b", "\\broulette\\b", "free coins", "spin\\w*\\b.{0,12}\\breels?\\b", "\\bvegas\\b"],
  sim: ["\\bsimulator\\b", "\\bsimulation\\b", "manage your", "city builder", "\\bfarm\\w*",
    "restaurant", "\\btycoon\\b", "build your (?:town|city|park|farm|empire)", "dress[ -]?up",
    "design your", "life sim\\w*"],
  strategy: ["\\bstrategy\\b", "tower defen[sc]e", "base building", "real[ -]?time strategy",
    "\\brts\\b", "command your (?:army|troops)", "\\btactical\\b", "\\b4x\\b", "conquer\\b"],
  shooter: ["\\bshooter\\b", "\\bfps\\b", "gunfight", "battle royale", "\\bsniper\\b",
    "shoot\\w* (?:enemies|zombies)", "aim and shoot", "third[ -]person shooter"],
  platformer: ["platformer", "jump and run", "\\bparkour\\b", "run and jump", "side[ -]scroll\\w*"],
  card: ["card game", "\\bccg\\b", "\\btcg\\b", "collectible card", "card battle\\w*",
    "\\bsolitaire\\b", "\\brummy\\b", "\\bspades\\b", "\\bhearts card\\b", "\\bdominoes\\b"],
  sports: ["\\bfootball\\b", "\\bsoccer\\b", "basketball", "\\btennis\\b", "\\bgolf\\b",
    "\\bbaseball\\b", "\\bcricket\\b", "\\bboxing\\b", "\\bnba\\b", "\\bnfl\\b", "\\bfifa\\b",
    "\\bbowling\\b", "\\bpool\\b.{0,10}\\b(?:8|eight)[ -]ball\\b"],
  "social-deduction": ["impostor", "social deduction", "among us", "find the traitor"],
  "casual-arcade": ["\\barcade\\b", "endless runner", "tap to play", "one[ -]tap", "hyper[ -]?casual",
    "dodge obstacles", "\\brunner\\b", "\\bstack\\b", "reflex"],
}

const ARCHETYPE_RE = Object.fromEntries(
  Object.entries(ARCHETYPE_KEYWORDS).map(([k, list]) => [k, list.map(p => new RegExp(p, "i"))]),
)

// Apple's own secondary genre (a.genres minus "Games") is a much better prior
// than description keywords. First entry doubles as the fallback archetype.
const GENRE_ARCHETYPES = {
  Casino: ["casino", "card"],
  Racing: ["racing"],
  Sports: ["sports", "casual-arcade"],
  Roleplaying: ["rpg", "roguelike", "strategy"],
  Strategy: ["strategy", "sim", "card", "rpg"],
  Board: ["card", "puzzle-logic", "social-deduction"],
  Card: ["card", "casino"],
  Word: ["puzzle-word"],
  Trivia: ["puzzle-word"],
  Puzzle: ["puzzle-logic", "match3", "merge", "puzzle-word", "platformer"],
  Action: ["casual-arcade", "shooter", "platformer", "roguelike"],
  Adventure: ["rpg", "platformer", "roguelike", "puzzle-logic"],
  Simulation: ["sim", "idle"],
  Family: ["casual-arcade", "puzzle-logic"],
  Casual: ["casual-arcade", "match3", "merge", "idle"],
  Music: ["casual-arcade"],
  Education: ["puzzle-word", "puzzle-logic"],
  Entertainment: ["casual-arcade"],
  Lifestyle: ["sim"],
}

function detectArchetype(g) {
  const title = (g.name || "").toLowerCase()
  const body = `${g.desc || ""} ${g.releaseNotes || ""}`.toLowerCase()
  const genres = (g.genres || []).filter(x => x && x !== "Games")
  const candidates = new Set()
  for (const gen of genres) for (const a of (GENRE_ARCHETYPES[gen] || [])) candidates.add(a)

  const scores = {}
  for (const [arch, regs] of Object.entries(ARCHETYPE_RE)) {
    let s = 0
    for (const re of regs) {
      if (re.test(title)) s += TITLE_WEIGHT
      else if (re.test(body)) s += BODY_WEIGHT
    }
    if (s > 0 && candidates.has(arch)) s += GENRE_PRIOR
    if (s > 0) scores[arch] = s
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (ranked.length && ranked[0][1] >= MIN_CONFIDENCE) return ranked[0][0]
  // No mechanical evidence: trust Apple's genre, then the generic bucket.
  for (const gen of genres) if (GENRE_ARCHETYPES[gen]) return GENRE_ARCHETYPES[gen][0]
  return ranked.length ? ranked[0][0] : "casual-arcade"
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
  // Long-stale entries are kept online for link preservation but dropped from
  // the index (and from the sitemap) instead of being deleted.
  if ((g.daysSinceSeen || 0) > STALE_DAYS) return "noindex,follow"
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
    g.indexDirective = indexDecision(g)

    // Only call LLM on active, indexable, high-signal games (budget control).
    // Archived entries are never re-sent to the LLM: their polish is carried
    // forward by the catalogue instead.
    if (useLLM && g.active && !g.llmEnriched && g.indexDirective.startsWith("index") && (g.signal || 0) >= 8) {
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
  await fs.writeFile(DST, JSON.stringify(out, null, 2))
  console.log(
    `Enriched ${all.length} catalogue games (${stats.active} active today, ` +
    `${stats.snapshots} snapshots). Indexable: ${all.filter(g => g.indexDirective.startsWith("index")).length}`,
  )
}

main().catch(e => { console.error(e); process.exit(1) })

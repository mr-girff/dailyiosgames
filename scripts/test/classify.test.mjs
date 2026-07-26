// Regression tests for the archetype classifier: `npm test`.
//
// The archetype is user-visible (page titles, /archetype/ pages, related games),
// and it is decided by heuristics over marketing copy, so it needs a fixed set of
// hand-labelled expectations. Two layers:
//
//   1. Synthetic cases — pure logic, always run.
//   2. Live catalogue — the biggest titles in data/enriched.json, labelled by
//      hand. Skipped when the data file is absent (fresh clone, no snapshots).

import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { detectArchetype, scoreArchetypes, ARCHETYPES } from "../lib/classify.mjs"

const g = (name, genres, desc = "", extra = {}) => ({ id: "0", name, genres, desc, ...extra })

test("Apple's specific genre wins when the copy says nothing mechanical", () => {
  // Regression: the genre used to only boost archetypes that already had a
  // keyword hit, so a game with no mechanic words fell back to genres[0] —
  // usually the least informative one.
  assert.equal(detectArchetype(g("Some Game", ["Games", "Action", "Entertainment", "Strategy"])), "strategy")
  assert.equal(detectArchetype(g("Some Game", ["Games", "Family", "Board", "Entertainment"])), "board")
  assert.equal(detectArchetype(g("Some Game", ["Games", "Casual", "Casino"])), "casino")
})

test("a title keyword beats a generic genre", () => {
  assert.equal(detectArchetype(g("Sniper Strike", ["Games", "Casual"], "shoot enemies")), "shooter")
  assert.equal(detectArchetype(g("Crossword Daily", ["Games", "Casual"])), "puzzle-word")
})

test("description keyword stuffing cannot outvote hard metadata", () => {
  // Every match3 keyword at once, but Apple says Casino: casino must still win.
  const desc = "candy jewels gem crush bubble pop block blast block puzzle colored blocks match 3 tile match"
  assert.equal(detectArchetype(g("Vegas Spin Party", ["Games", "Casino"], desc)), "casino")
})

test("board and sandbox exist instead of being forced into card/rpg", () => {
  assert.ok(ARCHETYPES.includes("board"))
  assert.ok(ARCHETYPES.includes("sandbox"))
  assert.equal(detectArchetype(g("Ludo King", ["Games", "Board"], "roll the dice and move around the board")), "board")
  assert.equal(
    detectArchetype(g("Block World", ["Games", "Adventure"], "a sandbox with user-generated experiences, create your own world")),
    "sandbox",
  )
})

test("scores are deterministic and never negative", () => {
  const game = g("Merge Farm Tycoon", ["Games", "Simulation", "Casual"], "merge crops, build your farm, manage your town")
  const a = scoreArchetypes(game), b = scoreArchetypes(game)
  assert.deepEqual(a, b)
  assert.equal(a.evidence, true)
  assert.ok(Object.values(a.scores).every(v => v > 0))
})

// ── Live catalogue expectations ────────────────────────────────────────────
// Hand-labelled by core loop, not by store category.
const EXPECTED = {
  "Roblox": "sandbox",
  "MONOPOLY GO!": "board",
  "Coin Master": "casino",
  "Township": "sim",
  "Candy Crush Saga": "match3",
  "Royal Match": "match3",
  "Toon Blast": "match3",
  "Gardenscapes": "match3",
  "Homescapes: Match 3 Games": "match3",
  "Subway Surfers": "casual-arcade",
  "Wordscapes - Word Game": "puzzle-word",
  "Bingo Blitz™ - BINGO Games": "casino",
  "Slotomania™ Slots Machine Game": "casino",
  "Cash Frenzy™ - Slots Casino": "casino",
  "Quick Hit Casino - Vegas Slots": "casino",
  "Solitaire Grand Harvest": "card",
  "Chess - Play & Learn Online": "board",
  "Last War:Survival": "strategy",
  "Whiteout Survival": "strategy",
  "Dream League Soccer 2026": "sports",
  "8 Ball Pool™": "sports",
  "Golf Clash - Golfing Simulator": "sports",
  "Sudoku.com - Number Games": "puzzle-logic",
  "DRAGON BALL LEGENDS": "rpg",
  "Brawl Stars": "shooter",
  "Clash of Clans": "strategy",
  "Clash Royale": "strategy",
  "Dice Dreams™": "board",
  "Block Blast！": "match3",
}

const dataPath = path.join(process.cwd(), "data/enriched.json")
test("known titles are classified by core loop", { skip: !fs.existsSync(dataPath) }, () => {
  const all = JSON.parse(fs.readFileSync(dataPath, "utf8")).all || []
  const byName = new Map(all.map(x => [x.name, x]))
  const wrong = []
  let checked = 0
  for (const [name, want] of Object.entries(EXPECTED)) {
    const game = byName.get(name)
    if (!game) continue // dropped off the charts; not a test failure
    checked++
    const got = detectArchetype(game)
    if (got !== want) wrong.push(`${name}: got ${got}, want ${want}`)
  }
  assert.ok(checked >= 10, `only ${checked} labelled titles found in the catalogue`)
  assert.deepEqual(wrong, [], `misclassified:\n  ${wrong.join("\n  ")}`)
})

test("no single archetype swallows the catalogue", { skip: !fs.existsSync(dataPath) }, () => {
  // The bug that started this: 26% of everything was labelled match3.
  const all = JSON.parse(fs.readFileSync(dataPath, "utf8")).all || []
  const counts = {}
  for (const game of all) {
    const a = detectArchetype(game)
    counts[a] = (counts[a] || 0) + 1
  }
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  assert.ok(n / all.length < 0.2, `${top} covers ${((n / all.length) * 100).toFixed(0)}% of the catalogue`)
})

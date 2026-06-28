// Hand-picked seeds for "iOS games like X" landing pages.
// Each seed maps to:
//   - archetypes: list of archetype names our pipeline uses
//   - tags: optional pipeline tags to match
//   - keywords: substrings to scan in name/desc/coreLoop for relevance scoring
//   - excludeKeywords: substrings that disqualify a candidate
//   - blurb: one-paragraph context for the SEO body copy
//
// Slugs are URL-safe and become /like/<slug>/

export interface LikeSeed {
  slug: string
  name: string                       // canonical title of the seed game ("Balatro")
  longTitle: string                  // page <title> phrase
  metaDescription: string
  blurb: string
  archetypes: string[]
  tags?: string[]
  keywords: string[]
  excludeKeywords?: string[]
  whatMakesItLikeThis: string[]      // 3-5 bullets for the page body
}

export const SEEDS: LikeSeed[] = [
  {
    slug: "balatro",
    name: "Balatro",
    longTitle: "iOS Games Like Balatro — Best Poker-Roguelike Alternatives",
    metaDescription: "iOS games like Balatro: deckbuilders, roguelike card games and poker-twist puzzles. Hand-picked from daily US App Store data with daily refreshes.",
    blurb: "Balatro hooked players with a tight roguelike loop wrapped around poker hands. Run-based scoring, jokers that bend the rules, and one-more-go pacing. These iOS alternatives carry one or more of those ingredients — roguelike structure, deckbuilding, hand-based scoring, or escalating modifier stacks.",
    archetypes: ["roguelike", "puzzle-logic", "puzzle-word"],
    tags: [],
    keywords: ["roguelike", "deck", "card", "poker", "joker", "run-based", "deckbuilder", "rogue-like", "card battler", "card game"],
    excludeKeywords: ["solitaire klondike", "spider solitaire"],
    whatMakesItLikeThis: [
      "Run-based progression with permanent meta-unlocks between runs.",
      "Deckbuilding or hand-construction as the core decision space.",
      "Modifier or 'joker' systems that escalate scoring exponentially.",
      "Tight 20–40 minute sessions with high replay value.",
    ],
  },
  {
    slug: "vampire-survivors",
    name: "Vampire Survivors",
    longTitle: "iOS Games Like Vampire Survivors — Auto-Shooter / Bullet Heaven Picks",
    metaDescription: "iOS games like Vampire Survivors: auto-shooters, reverse bullet hells, horde survivors and roguelite arena games. Daily-refreshed picks from the US App Store.",
    blurb: "Vampire Survivors codified an entire mobile genre: auto-attacking, wave-clearing, exponential power growth, 20-minute timer runs. These iOS alternatives all riff on that loop — minimal input, maximal screen-clearing chaos, and meta progression between runs.",
    archetypes: ["roguelike", "casual-arcade", "rpg"],
    tags: [],
    keywords: ["survivor", "horde", "auto-shoot", "auto shoot", "bullet hell", "bullet heaven", "wave", "swarm", "arena survival", "rogue-lite", "roguelite"],
    excludeKeywords: ["dating sim"],
    whatMakesItLikeThis: [
      "Hands-off auto-attacking — you move, the character shoots.",
      "Exponential power curve from compounding upgrades.",
      "Short timer-bound runs (10–30 minutes) with permanent unlocks.",
      "Cheap or free entry, runs well on older iPhones and iPads.",
    ],
  },
  {
    slug: "stardew-valley",
    name: "Stardew Valley",
    longTitle: "iOS Games Like Stardew Valley — Cozy Farming &amp; Life Sim Alternatives",
    metaDescription: "iOS games like Stardew Valley: cozy farming, life sim, town building and Harvest Moon-style alternatives. Daily-curated picks from the US App Store.",
    blurb: "Stardew Valley is the modern benchmark for cozy farming life sims — pixel-art farms, NPC relationships, seasonal rhythms, no pressure. These iOS picks all aim at the same emotional register: slow, satisfying, beautiful, and rewarding without combat-driven anxiety.",
    archetypes: ["sim", "rpg", "casual-arcade"],
    tags: ["family-safe", "offline"],
    keywords: ["farm", "cozy", "harvest", "village", "town building", "life sim", "farming", "garden", "pixel art", "relaxing"],
    excludeKeywords: ["farm heroes saga", "farmville"],
    whatMakesItLikeThis: [
      "Slow, satisfying loop — plant, water, harvest, repeat.",
      "Calm pacing with no fail states or aggressive monetization.",
      "Town-building, relationships, or seasonal events.",
      "Charming pixel art or hand-drawn presentation.",
    ],
  },
  {
    slug: "monopoly-go",
    name: "MONOPOLY GO!",
    longTitle: "iOS Games Like MONOPOLY GO! — Social Board &amp; Dice Game Alternatives",
    metaDescription: "iOS games like MONOPOLY GO!: dice-rolling social board games, builder-collector hybrids and live-event progression alternatives. Daily picks from the US App Store.",
    blurb: "MONOPOLY GO! made dice-rolling, friend-tagging, sticker-collecting board games massive on iOS. These alternatives copy one or more of the core systems: roll-to-progress, social events, collection meta, board-style movement.",
    archetypes: ["casino", "casual-arcade", "sim", "merge"],
    tags: ["multiplayer"],
    keywords: ["dice", "board", "monopoly", "roll", "sticker", "collect", "tycoon", "build a town", "village builder", "social board"],
    excludeKeywords: ["slot machine"],
    whatMakesItLikeThis: [
      "Dice-roll-driven progression on a board.",
      "Social leaderboards, friend events, or sticker trading.",
      "Builder-collector meta layer outside the core loop.",
      "Free-to-play but explicitly cosmetic-only or light monetization.",
    ],
  },
  {
    slug: "clash-royale",
    name: "Clash Royale",
    longTitle: "iOS Games Like Clash Royale — Real-Time PvP Card Battler Alternatives",
    metaDescription: "iOS games like Clash Royale: real-time PvP card battlers, mini-MOBA strategy games and arena card games for iPhone &amp; iPad. Daily-refreshed picks.",
    blurb: "Clash Royale launched the real-time PvP card-battler genre on mobile. 3-minute matches, lane control, elixir economy, deck mastery. These iOS picks lean into the same combo of card collection plus live arena combat.",
    archetypes: ["rpg", "strategy", "casino"],
    tags: ["multiplayer"],
    keywords: ["pvp", "real-time", "arena", "card battler", "tower defense", "lane", "deck", "vs", "1v1", "elixir", "strategy card"],
    excludeKeywords: ["solitaire"],
    whatMakesItLikeThis: [
      "Short live PvP matches (2–5 minutes).",
      "Deck-building with collectible units or spells.",
      "Skill ceiling around timing and resource curves.",
      "Ranked ladder with seasonal resets.",
    ],
  },
  {
    slug: "slay-the-spire",
    name: "Slay the Spire",
    longTitle: "iOS Games Like Slay the Spire — Roguelike Deckbuilder Alternatives",
    metaDescription: "iOS games like Slay the Spire: roguelike deckbuilders, single-player card-game RPGs and turn-based card combat for iPhone &amp; iPad. Daily-curated picks.",
    blurb: "Slay the Spire defined the modern roguelike deckbuilder: pick a class, climb branching floors, build a deck on the fly, fight escalating elites and bosses. These iOS picks all share the single-player, run-based, deck-driven combat skeleton.",
    archetypes: ["roguelike", "rpg", "puzzle-logic"],
    tags: [],
    keywords: ["deckbuilder", "deck builder", "roguelike", "rogue-lite", "card battle", "card game", "spire", "dungeon crawl", "card rpg"],
    excludeKeywords: [],
    whatMakesItLikeThis: [
      "Single-player runs with permadeath and branching maps.",
      "Deck construction as the core decision loop.",
      "Turn-based combat with energy/cost economies.",
      "Strong replayability via class variety and relic synergies.",
    ],
  },
  {
    slug: "pokemon",
    name: "Pokémon",
    longTitle: "iOS Games Like Pokémon — Monster-Collecting RPG Alternatives",
    metaDescription: "iOS games like Pokémon: monster-collecting RPGs, creature-battler card games and turn-based capture-and-train alternatives. Daily-refreshed picks.",
    blurb: "Pokémon's loop is the gold standard: catch creatures, train them, build a team, battle. These iOS picks all live in that genre — creature collection, type-matching combat, and a long-tail team-building meta game.",
    archetypes: ["rpg", "roguelike"],
    tags: [],
    keywords: ["monster", "creature", "collect", "evolve", "tame", "capture", "team battle", "elemental", "gacha rpg", "monster taming"],
    excludeKeywords: [],
    whatMakesItLikeThis: [
      "Collect and train creatures with elemental types.",
      "Turn-based team battles with rock-paper-scissors-style matchups.",
      "Long progression hooked on roster building and breeding.",
      "Single-player campaign or open-world capture loop.",
    ],
  },
  {
    slug: "candy-crush",
    name: "Candy Crush",
    longTitle: "iOS Games Like Candy Crush — Match-3 Puzzle Alternatives",
    metaDescription: "iOS games like Candy Crush: match-3 puzzles, level-based swap-matchers and casual sweet-themed alternatives for iPhone &amp; iPad. Daily-refreshed picks.",
    blurb: "Candy Crush set the template for level-based match-3: hundreds of bite-sized puzzles, increasing difficulty, satisfying chain combos. These iOS picks all riff on that — swap-and-match grids, escalating objective puzzles, and quick-session pacing.",
    archetypes: ["match3", "merge", "casual-arcade"],
    tags: [],
    keywords: ["match 3", "match-3", "match three", "swap", "combo", "puzzle level", "blast", "crush"],
    excludeKeywords: [],
    whatMakesItLikeThis: [
      "Swap-and-match grid mechanics.",
      "Level-based progression with escalating objectives.",
      "Short 1–3 minute puzzle sessions.",
      "Power-ups and combo chains as the skill layer.",
    ],
  },
]

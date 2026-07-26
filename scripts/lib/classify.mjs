// Archetype classifier.
//
// The archetype drives the page title, the /archetype/ landing pages, the
// session-length estimate and the similar-games graph, so a wrong label is
// visible in production and in search results.
//
// History of this file:
//   1. "first archetype with any substring hit wins", scanning the whole
//      marketing description for loose words ("blast", "crush", "hero", "race").
//      101 of 393 games (26%) came out as `match3`, including a sniper shooter.
//   2. Weighted word-boundary matching + Apple genre as a tie-breaker. Much
//      better, but the genre could only ever *boost* an archetype that already
//      had a keyword hit, so the most reliable signal available — Apple's own
//      "Strategy" or "Board" genre — could not win on its own. Clash of Clans
//      came out `casual-arcade`, MONOPOLY GO! `casual-arcade`, Township `match3`.
//   3. This version: the genre contributes score on its own, genres are ranked by
//      how much they actually tell us ("Action" and "Entertainment" say nothing;
//      "Casino", "Board" and "Word" are decisive), body-keyword evidence is capped
//      so a keyword-stuffed description cannot outvote hard metadata, and
//      `board` / `sandbox` exist as archetypes instead of being forced into
//      `card` / `rpg`.

const TITLE_WEIGHT = 3
const BODY_WEIGHT = 1
const BODY_CAP = 3        // at most 3 points of description evidence per archetype
const GENRE_BASE = 1.5    // every archetype the most specific genre allows
const GENRE_OTHER = 1     // best archetype of the game's remaining genres

// Keyword sets are deliberately specific: a word must describe a mechanic, not
// just appear in ad copy.
export const ARCHETYPE_KEYWORDS = {
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
  rpg: ["\\brpg\\b", "role[ -]?playing", "turn[ -]based (?:battle|combat|rpg)", "\\bguild\\b",
    "\\bgacha\\b", "summon (?:heroes|characters)", "hero collect\\w*", "raid boss", "skill tree",
    "level up your (?:hero|character)"],
  roguelike: ["roguelike", "rogue[ -]?lite", "permadeath", "run[ -]based", "deck[ -]?build\\w*",
    "each run", "procedurally generated"],
  racing: ["\\bracing\\b", "race track", "\\bdrift\\w*", "\\bkart\\b", "drag racing", "car racing",
    "\\bpit stop\\b", "lap times?"],
  casino: ["slot machine", "\\bslots\\b", "\\bcasino\\b", "\\bpoker\\b", "\\bbingo\\b", "blackjack",
    "\\bjackpot\\b", "\\broulette\\b", "free coins", "spin\\w*\\b.{0,12}\\breels?\\b", "\\bvegas\\b",
    "spin (?:the|to) (?:wheel|win)", "daily spins?"],
  sim: ["\\bsimulator\\b", "\\bsimulation\\b", "manage your", "city[ -]?build\\w*", "\\bfarm\\w*",
    "restaurant", "\\btycoon\\b", "build (?:your |a )?(?:own |dream )*(?:town|city|park|farm|empire|village|house)",
    "dress[ -]?up", "design your", "life sim\\w*", "decorate\\w*", "grow crops"],
  strategy: ["\\bstrategy\\b", "tower defen[sc]e", "base building", "real[ -]?time strategy",
    "\\brts\\b", "command your (?:army|troops)", "\\btactical\\b", "\\b4x\\b", "conquer\\b",
    "train (?:your )?troops", "\\bclan wars?\\b", "build (?:your )?(?:army|base)", "\\balliance\\b",
    "\\bsurvivors?\\b", "zombie\\w* (?:waves?|infestation|apocalypse)", "\\bhero(?:es)? squad\\b",
    "\\bupgrade your base\\b", "\\bdeploy\\b"],
  shooter: ["\\bshooter\\b", "\\bfps\\b", "gunfight", "battle royale", "\\bsniper\\b",
    "shoot\\w* (?:enemies|zombies)", "aim and shoot", "third[ -]person shooter",
    "\\bmoba\\b", "\\d\\s?v\\s?\\d\\b", "pvp arena"],
  platformer: ["platformer", "jump and run", "\\bparkour\\b", "run and jump", "side[ -]scroll\\w*"],
  card: ["card game", "\\bccg\\b", "\\btcg\\b", "collectible card", "card battle\\w*",
    "\\bsolitaire\\b", "\\brummy\\b", "\\bspades\\b", "\\bhearts card\\b"],
  board: ["board game", "\\bmonopoly\\b", "\\bludo\\b", "\\bchess\\b", "\\bcheckers\\b",
    "\\bbackgammon\\b", "\\bdominoes\\b", "\\bparchis\\b", "roll the dice", "\\bdice\\b.{0,20}\\bboard\\b",
    "move around the board", "\\bproperties\\b.{0,20}\\brent\\b"],
  sandbox: ["\\bsandbox\\b", "user[ -]generated", "millions of (?:games|experiences)",
    "create your own (?:world|game|experience)", "build anything", "\\bobby\\b",
    "unlimited creativity", "virtual world"],
  sports: ["\\bfootball\\b", "\\bsoccer\\b", "basketball", "\\btennis\\b", "\\bgolf\\w*",
    "\\bbaseball\\b", "\\bcricket\\b", "\\bboxing\\b", "\\bnba\\b", "\\bnfl\\b", "\\bfifa\\b",
    "\\bbowling\\b", "\\bpool\\b.{0,10}\\b(?:8|eight)[ -]ball\\b", "\\b(?:8|eight)[ -]ball\\b"],
  "social-deduction": ["impostor", "social deduction", "among us", "find the traitor"],
  "casual-arcade": ["\\barcade\\b", "endless runner", "tap to play", "one[ -]tap", "hyper[ -]?casual",
    "dodge obstacles", "\\brunner\\b", "\\bstack\\b", "reflex"],
}

// Patterns that are only trustworthy in a title. "Match" or "Blast" in a name is
// a strong genre marker (Royal Match, Toon Blast, Block Blast); the same words
// inside marketing copy mean nothing.
const TITLE_ONLY_KEYWORDS = {
  match3: ["\\bmatch\\b", "\\bblast\\b", "\\bcrush\\b", "\\bscapes\\b"],
  board: ["\\bdice\\b", "\\bboard\\b"],
  casino: ["\\bspins?\\b", "\\bcoin master\\b"],
  sports: ["\\bclash\\b.{0,10}\\bgolf\\b"],
}

const TITLE_ONLY_RE = Object.fromEntries(
  Object.entries(TITLE_ONLY_KEYWORDS).map(([k, list]) => [k, list.map(p => new RegExp(p, "i"))]),
)

const ARCHETYPE_RE = Object.fromEntries(
  Object.entries(ARCHETYPE_KEYWORDS).map(([k, list]) => [k, list.map(p => new RegExp(p, "i"))]),
)

// Apple's secondary genres, best archetype first.
const GENRE_ARCHETYPES = {
  Casino: ["casino", "card"],
  Racing: ["racing"],
  Sports: ["sports", "casual-arcade"],
  Roleplaying: ["rpg", "roguelike", "strategy"],
  Strategy: ["strategy", "sim", "card", "rpg"],
  Board: ["board", "card", "puzzle-logic", "social-deduction"],
  Card: ["card", "casino"],
  Word: ["puzzle-word"],
  Trivia: ["puzzle-word"],
  Puzzle: ["puzzle-logic", "match3", "merge", "puzzle-word", "platformer"],
  Action: ["casual-arcade", "shooter", "platformer", "roguelike"],
  Adventure: ["rpg", "platformer", "roguelike", "puzzle-logic"],
  Simulation: ["sim", "idle"],
  Family: ["casual-arcade", "board", "puzzle-logic"],
  Casual: ["casual-arcade", "match3", "merge", "idle"],
  Music: ["casual-arcade"],
  Education: ["puzzle-word", "puzzle-logic"],
  Entertainment: ["casual-arcade"],
  Lifestyle: ["sim"],
}

// How much a genre narrows things down. Apple lets publishers pick up to three,
// and the order is not meaningful — "Games, Action, Entertainment, Strategy" for
// Clash of Clans put the least informative genre first. Ranking by specificity
// (rather than taking genres[0]) is what makes the fallback usable.
const GENRE_SPECIFICITY = {
  Casino: 10, Word: 10, Racing: 9, Board: 9, Card: 8, Trivia: 8, Sports: 8,
  Roleplaying: 7, Strategy: 7, Simulation: 6, Puzzle: 5, Education: 4,
  Adventure: 3, Action: 2, Family: 2, Casual: 2, Music: 2, Lifestyle: 1,
  Entertainment: 0,
}

// Titles whose store metadata is genuinely misleading — a platform listed as a
// role-playing game, a slot machine listed as an adventure. Kept deliberately
// tiny; anything that can be fixed with a keyword belongs in the tables above.
// Keys are App Store ids.
export const ARCHETYPE_OVERRIDES = {
  // Roblox is a platform: its own description advertises every genre at once
  // ("racing, shooter battles, RPG adventures, tycoon games"), so no amount of
  // keyword weighting can classify it.
  "431946152": "sandbox",
  // Coin Master's copy sells a village builder ("build village after village")
  // and never uses a casino word, but the loop is a slot machine.
  "406889139": "casino",
}

function genresOf(g) {
  return (g.genres || []).filter(x => x && x !== "Games")
}

/**
 * Score every archetype and return the winner.
 * Exported for scripts/test/classify.test.mjs.
 */
export function scoreArchetypes(g) {
  const title = (g.name || "").toLowerCase()
  const body = `${g.desc || ""} ${g.releaseNotes || ""}`.toLowerCase()
  const genres = genresOf(g)
    .filter(x => GENRE_ARCHETYPES[x])
    .sort((a, b) => (GENRE_SPECIFICITY[b] ?? 0) - (GENRE_SPECIFICITY[a] ?? 0))

  const scores = {}
  const add = (arch, n) => { scores[arch] = (scores[arch] || 0) + n }

  // 1. Metadata. Every archetype the most specific genre allows gets the same
  //    base: ranking them here would just hardcode "every Puzzle game is
  //    puzzle-logic", which is how Royal Match and Gardenscapes lost their
  //    match3 label. Order inside GENRE_ARCHETYPES is only used as the no-evidence
  //    fallback in detectArchetype().
  genres.forEach((gen, i) => {
    const list = GENRE_ARCHETYPES[gen] || []
    list.forEach((arch, j) => {
      if (i === 0) add(arch, GENRE_BASE)
      // Vague genres (Action, Casual, Entertainment, Family, Music) contribute
      // nothing beyond being the primary: stacking +1 for each of them is how
      // Brawl Stars — "3v3 & 5v5 MOBA and Battle Royale" — scored higher as
      // casual-arcade than as shooter.
      else if (j === 0 && (GENRE_SPECIFICITY[gen] ?? 0) >= 3) add(arch, GENRE_OTHER)
    })
  })

  // 2. Mechanical keywords. Title hits are strong; description evidence is capped
  //    so long ad copy cannot stack eight weak hits and beat the metadata.
  let evidence = false
  for (const [arch, regs] of Object.entries(ARCHETYPE_RE)) {
    let titleScore = 0, bodyScore = 0
    for (const re of regs) {
      if (re.test(title)) titleScore += TITLE_WEIGHT
      else if (re.test(body)) bodyScore += BODY_WEIGHT
    }
    for (const re of (TITLE_ONLY_RE[arch] || [])) if (re.test(title)) titleScore += TITLE_WEIGHT
    if (titleScore || bodyScore) {
      add(arch, titleScore + Math.min(bodyScore, BODY_CAP))
      evidence = true
    }
  }

  // Order of the primary genre's archetype list, used only to break exact ties.
  const priority = {}
  ;(GENRE_ARCHETYPES[genres[0]] || []).forEach((arch, i) => { priority[arch] = i })

  return { scores, evidence, priority }
}

/** score desc → primary-genre order → name, so the result never depends on the alphabet. */
function rank(scores, priority) {
  return Object.entries(scores).sort((a, b) =>
    b[1] - a[1] ||
    (priority[a[0]] ?? 99) - (priority[b[0]] ?? 99) ||
    a[0].localeCompare(b[0]))
}

export function detectArchetype(g) {
  const override = ARCHETYPE_OVERRIDES[String(g.id)]
  if (override) return override

  const { scores, evidence, priority } = scoreArchetypes(g)
  // Ties are common (Clash of Clans scored strategy 2.5 / sim 2.5). Falling back
  // to alphabetical order picked `sim`; Apple's own Strategy category lists
  // `strategy` first, which is the better answer and is not arbitrary.
  const ranked = rank(scores, priority)

  // With any mechanical evidence at all, the weighted winner decides: the genre
  // base (1.5) already outweighs a single stray keyword (1), so it takes real
  // evidence — a title hit or two description hits — to overrule the metadata.
  if (evidence && ranked.length) return ranked[0][0]

  // No mechanical evidence anywhere: trust the most specific genre.
  const genres = genresOf(g).filter(x => GENRE_ARCHETYPES[x])
    .sort((a, b) => (GENRE_SPECIFICITY[b] ?? 0) - (GENRE_SPECIFICITY[a] ?? 0))
  if (genres.length) return GENRE_ARCHETYPES[genres[0]][0]
  return ranked.length ? ranked[0][0] : "casual-arcade"
}

export const ARCHETYPES = Object.keys(ARCHETYPE_KEYWORDS)

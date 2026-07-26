#!/usr/bin/env node
// Daily US App Store new-games + updates fetcher.
// Outputs: data/YYYY-MM-DD.json + data/latest.json + src/content/posts/*.md
// Usage: node scripts/fetch_daily.mjs

import fs from "node:fs/promises"
import path from "node:path"
import { serialize } from "./lib/json.mjs"

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const POSTS_DIR = path.join(ROOT, "src/content/posts")
const COUNTRY = process.env.COUNTRY || "us"
const GENRE = 6014 // Games

const today = new Date().toISOString().slice(0, 10)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Apple's public endpoints return sporadic 403/429/5xx from cloud IPs. Without
// retries a single blip aborted the whole daily refresh (and the site then went
// a day stale), so every request gets bounded exponential backoff with jitter.
async function getJSON(url, { retries = 4, timeoutMs = 20000 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 400)
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "DailyGameBot/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (r.status === 429 || r.status >= 500 || r.status === 403) {
        lastErr = new Error(`${url} -> ${r.status}`)
        continue
      }
      if (!r.ok) throw new Error(`${url} -> ${r.status}`)
      return await r.json()
    } catch (e) {
      lastErr = e
      if (e?.name === "SyntaxError") continue // truncated body — retry
      if (attempt === retries) break
    }
  }
  throw lastErr || new Error(`${url} -> failed`)
}

async function suggest(q, ds = "") {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}${ds ? "&ds=" + ds : ""}&hl=en`
  try { return (await getJSON(u))[1] || [] } catch { return [] }
}

// Legacy iTunes RSS feed. Apple has been sunsetting these; `marketingToolsFeed`
// below is the modern replacement and is used as an automatic fallback.
async function rssEntries(feed) {
  const url = `https://itunes.apple.com/${COUNTRY}/rss/${feed}/limit=100/genre=${GENRE}/json`
  const j = await getJSON(url)
  return (j.feed?.entry || []).map(e => e.id?.attributes?.["im:id"]).filter(Boolean)
}

// rss.applemarketingtools.com equivalents of the legacy feeds.
//
// Verified against the live API on 2026-07-26: the only app feeds that exist are
// `top-free` and `top-paid`. `games-we-love` and `new-apps-we-love` both 404 —
// the previous mapping for `newapplications` could never have worked — and there
// is no grossing feed at all, so mapping `topgrossingapplications` to `top-paid`
// silently recorded paid-chart positions as grossing ranks.
//
// A feed with no modern equivalent falls back to nothing rather than to the wrong
// chart: new releases are identified from the release date returned by the lookup
// step, not from which feed an id came out of, so losing the legacy `newapplications`
// feed degrades coverage without corrupting anything.
//
// Note the modern feed is not genre-filtered (the legacy one is, via genre=6014);
// non-games are dropped after lookup by the existing `genres.includes("Games")`
// filter in main().
const MARKETING_FEED = {
  topfreeapplications: "top-free",
}

async function marketingToolsFeed(feed) {
  const kind = MARKETING_FEED[feed]
  if (!kind) {
    console.warn(`feed ${feed}: no modern equivalent exists — skipping this feed for today`)
    return []
  }
  const url = `https://rss.applemarketingtools.com/api/v2/${COUNTRY}/apps/${kind}/100/apps.json`
  const j = await getJSON(url)
  return (j.feed?.results || []).map(r => r.id).filter(Boolean)
}

// Never let one dead feed kill the run: fall back to the modern endpoint, then
// give up on *that feed only* and carry on with whatever the others returned.
async function chartIds(feed) {
  try {
    const ids = await rssEntries(feed)
    if (ids.length) return ids
    console.warn(`feed ${feed}: legacy RSS returned 0 entries, trying marketing-tools feed`)
  } catch (e) {
    console.warn(`feed ${feed}: legacy RSS failed (${e.message}), trying marketing-tools feed`)
  }
  try {
    return await marketingToolsFeed(feed)
  } catch (e) {
    console.warn(`feed ${feed}: fallback failed too (${e.message}) — continuing without it`)
    return []
  }
}

async function lookup(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(",")
    try {
      const j = await getJSON(`https://itunes.apple.com/lookup?id=${chunk}&country=${COUNTRY}`)
      out.push(...(j.results || []))
    } catch (e) {
      console.warn(`lookup chunk ${i / 100 + 1} failed: ${e.message}`)
    }
  }
  return out
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "game"
}

function domainIdeas(name) {
  const words = name.toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const slug = words.slice(0, 2).join("")
  return [`${slug}.online`, `${slug}game.com`, `play${slug}.io`, `${slug}guide.com`, `${slug}wiki.com`]
}

/**
 * Refuse to write a snapshot that is a fraction of a normal day's harvest.
 *
 * "Did we get *any* games?" is not a strong enough check. The modern fallback
 * feed is not genre-filtered — a live probe of 50 fallback ids returned 2 games —
 * so a total outage of the legacy RSS feeds yields a handful of games, which is
 * far worse than yielding none: the catalogue would mark almost everything as
 * not-seen-today, heat scores would collapse, and 21 days of that would noindex
 * the site. A snapshot well below the recent norm is a failed run, not news.
 */
async function assertPlausibleHarvest(count) {
  const files = (await fs.readdir(DATA_DIR))
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-7)
  const counts = []
  for (const f of files) {
    try {
      const snap = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8"))
      counts.push((snap.newReleases?.length || 0) + (snap.updates?.length || 0))
    } catch {}
  }
  if (counts.length < 3) return // not enough history to judge
  counts.sort((a, b) => a - b)
  const median = counts[Math.floor(counts.length / 2)]
  const floor = Math.max(20, Math.round(median * 0.4))
  if (count < floor) {
    throw new Error(
      `only ${count} games harvested, expected at least ${floor} (median of last ` +
      `${counts.length} snapshots: ${median}) — refusing to write a truncated snapshot`,
    )
  }
  console.log(`harvest sanity: ${count} games (median ${median}, floor ${floor})`)
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(POSTS_DIR, { recursive: true })

  const [newIds, freeIds, grossIds] = await Promise.all([
    chartIds("newapplications"),
    chartIds("topfreeapplications"),
    chartIds("topgrossingapplications"),
  ])
  const allIds = [...new Set([...newIds, ...freeIds, ...grossIds].map(String))]
  if (!allIds.length) throw new Error("all chart feeds failed — refusing to write an empty snapshot")
  const apps = await lookup(allIds)
  if (!apps.length) throw new Error("lookup returned no apps — refusing to write an empty snapshot")

  // Chart position maps (1-based rank within each feed). Stored per game so a
  // later step can compute rank momentum over time. Absent => not on that chart.
  const rankIn = (ids) => { const m = new Map(); ids.forEach((id, i) => m.set(String(id), i + 1)); return m }
  const newRank = rankIn(newIds), freeRank = rankIn(freeIds), grossRank = rankIn(grossIds)

  const now = Date.now(), DAY = 86400000
  const games = apps.filter(a => (a.genres || []).includes("Games"))
  await assertPlausibleHarvest(games.length)
  // Null instead of NaN when Apple omits a date.
  const ageDays = (d) => {
    const t = d ? new Date(d).getTime() : NaN
    return Number.isFinite(t) ? Math.round((now - t) / DAY) : null
  }

  const enrich = (a) => ({
    id: String(a.trackId),
    name: a.trackName,
    seller: a.sellerName || a.artistName,
    bundle: a.bundleId,
    price: a.formattedPrice,
    genres: a.genres,
    releaseDate: a.releaseDate?.slice(0, 10),
    currentVersionDate: a.currentVersionReleaseDate?.slice(0, 10),
    version: a.version,
    rating: a.averageUserRating || 0,
    ratingCount: a.userRatingCount || 0,
    size_mb: a.fileSizeBytes ? Math.round(+a.fileSizeBytes / 1024 / 1024) : null,
    url: a.trackViewUrl,
    rank: {
      new:      newRank.get(String(a.trackId))   ?? null,
      free:     freeRank.get(String(a.trackId))  ?? null,
      grossing: grossRank.get(String(a.trackId)) ?? null,
    },
    icon: a.artworkUrl512 || a.artworkUrl100,
    screenshots: (a.screenshotUrls || []).slice(0, 4),
    desc: (a.description || "").slice(0, 1500),
    releaseNotes: (a.releaseNotes || "").slice(0, 800),
    daysSinceRelease: ageDays(a.releaseDate),
    daysSinceUpdate: ageDays(a.currentVersionReleaseDate),
  })

  const newReleases = games.filter(a => (now - new Date(a.releaseDate).getTime()) / DAY <= 60).map(enrich)
    .sort((a, b) => a.daysSinceRelease - b.daysSinceRelease)
  const updates = games.filter(a => {
    const r = (now - new Date(a.releaseDate).getTime()) / DAY
    const u = (now - new Date(a.currentVersionReleaseDate).getTime()) / DAY
    return r > 60 && u <= 14
  }).map(enrich).sort((a, b) => a.daysSinceUpdate - b.daysSinceUpdate)

  // Enrich with keyword signals (top 30 most promising of each)
  const enrichWithKw = async (list, limit) => {
    for (const g of list.slice(0, limit)) {
      const [gs, ys] = await Promise.all([suggest(g.name), suggest(g.name, "yt")])
      g.googleSuggest = gs.slice(0, 10)
      g.youtubeSuggest = ys.slice(0, 10)
      // Count of Google + YouTube autocomplete completions for the title: a proxy
      // for how much people are already searching for this game. It was called
      // `signal`, and a derived `verdict` of "build" / "watch" / "skip" — leftovers
      // from the template's original purpose (deciding which keyword to build a
      // site around). "build" was rendered to readers as a "High signal" badge,
      // which said nothing about the game. The number is useful; the advice is not.
      g.searchDemand = (g.googleSuggest.length + g.youtubeSuggest.length)
      g.domains = domainIdeas(g.name)
    }
  }
  await enrichWithKw(newReleases, 30)
  await enrichWithKw(updates, 30)

  const payload = { date: today, newReleases, updates, generatedAt: new Date().toISOString() }
  await fs.writeFile(path.join(DATA_DIR, `${today}.json`), serialize(payload))
  await fs.writeFile(path.join(DATA_DIR, "latest.json"), serialize(payload))

  // Emit markdown post for the daily aggregator site
  const post = renderPost(payload)
  await fs.writeFile(path.join(POSTS_DIR, `${today}.md`), post)

  console.log(`Done. newReleases=${newReleases.length} updates=${updates.length}`)
}

function renderPost(p) {
  const fm = [
    "---",
    `title: "US App Store New Games & Updates — ${p.date}"`,
    `description: "${p.newReleases.length} new game releases and ${p.updates.length} top-chart updates on the US App Store on ${p.date}."`,
    `pubDate: ${p.date}`,
    `tags: ["app-store", "ios-games", "daily"]`,
    "---",
    "",
  ].join("\n")
  const tldr = `**TL;DR** — On ${p.date}, the US App Store added ${p.newReleases.length} new games and ${p.updates.length} top-chart games shipped updates. Most searched-for new game: ${[...p.newReleases].sort((a,b)=>(b.searchDemand||0)-(a.searchDemand||0))[0]?.name || "n/a"}. Biggest update: ${p.updates[0]?.name || "n/a"}.\n`
  const row = (g) => `| [${g.name}](${g.url}) | ${g.seller || ""} | ${g.releaseDate} | ${g.rating || "-"} (${g.ratingCount}) | ${g.searchDemand ?? "-"} |`
  const newTable = ["## New Releases", "", "| Game | Developer | Released | Rating | Search demand |", "|---|---|---|---|---|", ...p.newReleases.slice(0,30).map(row)].join("\n")
  const updTable = ["## Updates (Top Charts)", "", "| Game | Developer | Updated | Rating | Search demand |", "|---|---|---|---|---|", ...p.updates.slice(0,30).map(g=>`| [${g.name}](${g.url}) | ${g.seller||""} | ${g.currentVersionDate} (${g.daysSinceUpdate}d) | ${g.rating || "-"} (${g.ratingCount}) | ${g.searchDemand ?? "-"} |`)].join("\n")
  return fm + "\n" + tldr + "\n" + newTable + "\n\n" + updTable + "\n"
}

main().catch(e => { console.error(e); process.exit(1) })

#!/usr/bin/env node
// Daily US App Store new-games + updates fetcher.
// Outputs: data/YYYY-MM-DD.json + data/latest.json + src/content/posts/*.md
// Usage: node scripts/fetch_daily.mjs

import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, "data")
const POSTS_DIR = path.join(ROOT, "src/content/posts")
const COUNTRY = process.env.COUNTRY || "us"
const GENRE = 6014 // Games

const today = new Date().toISOString().slice(0, 10)

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "DailyGameBot/1.0" } })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

async function suggest(q, ds = "") {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}${ds ? "&ds=" + ds : ""}&hl=en`
  try { return (await getJSON(u))[1] || [] } catch { return [] }
}

async function rssEntries(feed) {
  const url = `https://itunes.apple.com/${COUNTRY}/rss/${feed}/limit=100/genre=${GENRE}/json`
  const j = await getJSON(url)
  return (j.feed?.entry || []).map(e => e.id?.attributes?.["im:id"]).filter(Boolean)
}

async function lookup(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(",")
    const j = await getJSON(`https://itunes.apple.com/lookup?id=${chunk}&country=${COUNTRY}`)
    out.push(...(j.results || []))
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

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(POSTS_DIR, { recursive: true })

  const newIds   = await rssEntries("newapplications")
  const freeIds  = await rssEntries("topfreeapplications")
  const grossIds = await rssEntries("topgrossingapplications")
  const allIds = [...new Set([...newIds, ...freeIds, ...grossIds])]
  const apps = await lookup(allIds)

  const now = Date.now(), DAY = 86400000
  const games = apps.filter(a => (a.genres || []).includes("Games"))

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
    icon: a.artworkUrl512 || a.artworkUrl100,
    screenshots: (a.screenshotUrls || []).slice(0, 4),
    desc: (a.description || "").slice(0, 1500),
    releaseNotes: (a.releaseNotes || "").slice(0, 800),
    daysSinceRelease: Math.round((now - new Date(a.releaseDate).getTime()) / DAY),
    daysSinceUpdate: Math.round((now - new Date(a.currentVersionReleaseDate).getTime()) / DAY),
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
      g.signal = (g.googleSuggest.length + g.youtubeSuggest.length)
      g.verdict = g.signal >= 10 ? "build" : g.signal >= 5 ? "watch" : "skip"
      g.domains = domainIdeas(g.name)
    }
  }
  await enrichWithKw(newReleases, 30)
  await enrichWithKw(updates, 30)

  const payload = { date: today, newReleases, updates, generatedAt: new Date().toISOString() }
  await fs.writeFile(path.join(DATA_DIR, `${today}.json`), JSON.stringify(payload, null, 2))
  await fs.writeFile(path.join(DATA_DIR, "latest.json"), JSON.stringify(payload, null, 2))

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
  const tldr = `**TL;DR** — On ${p.date}, the US App Store added ${p.newReleases.length} new games and ${p.updates.length} top-chart games shipped updates. Highest-signal new game: ${p.newReleases.find(g=>g.verdict==="build")?.name || p.newReleases[0]?.name || "n/a"}. Biggest update: ${p.updates[0]?.name || "n/a"}.\n`
  const row = (g) => `| [${g.name}](${g.url}) | ${g.seller || ""} | ${g.releaseDate} | ${g.rating || "-"} (${g.ratingCount}) | ${g.signal ?? "-"} |`
  const newTable = ["## New Releases", "", "| Game | Developer | Released | Rating | Signal |", "|---|---|---|---|---|", ...p.newReleases.slice(0,30).map(row)].join("\n")
  const updTable = ["## Updates (Top Charts)", "", "| Game | Developer | Updated | Rating | Signal |", "|---|---|---|---|---|", ...p.updates.slice(0,30).map(g=>`| [${g.name}](${g.url}) | ${g.seller||""} | ${g.currentVersionDate} (${g.daysSinceUpdate}d) | ${g.rating || "-"} (${g.ratingCount}) | ${g.signal ?? "-"} |`)].join("\n")
  return fm + "\n" + tldr + "\n" + newTable + "\n\n" + updTable + "\n"
}

main().catch(e => { console.error(e); process.exit(1) })

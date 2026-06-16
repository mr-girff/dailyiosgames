# SEO Upgrades v2 — from "templated" to "understood"

This document explains every upgrade between v0.1 (basic template) and v0.2 (the version Google actually wants to rank).

## TL;DR diff

| Concern | v0.1 | v0.2 |
|---|---|---|
| Per-game design | Identical layout | 8 palettes × 5 hero layouts, picked from `archetype` |
| Content | Apple description verbatim | TL;DR + core loop + hook + red flags + audience + similar games |
| Images | Hot-linked from Apple CDN, generic alt | Downloaded → AVIF+WebP responsive `srcset`, alt describes gameplay |
| Indexing | Everything indexed | `noindex` for zero-demand pages; 410 after 30 days no impressions |
| Schema | VideoGame + FAQ | + Breadcrumb + Article + Review + CollectionPage + ItemList |
| Internal links | "All games" list | Per-archetype clusters + similarity (Jaccard) + same-studio |
| EEAT Experience | None | Methodology page + transparent red-flag caveats + author/org schema |
| Canonical | Implicit | Explicit per page, robots meta per page |
| Core Web Vitals | Untuned | `fetchpriority` hero, AdSense lazy after 3s, palette CSS vars inlined |
| LLM enrichment | No | Optional `gpt-4o-mini` pass only on signal ≥ 8 (cost ~$0.001/game) |

## New pipeline

```
fetch_daily.mjs   →  data/latest.json
enrich.mjs        →  data/enriched.json  (+archetype, palette, hero, similar, indexDirective)
images.mjs        →  /public/img/<id>/icon-{64,128,256,512}.{avif,webp} + s{0..3}-{400,800,1200}.{avif,webp}
astro build       →  static site
```

## Files added or rewritten

| Path | What it does |
|---|---|
| `scripts/enrich.mjs` | Rule-based archetype/monetization/audience/red-flag detector + optional LLM polish + Jaccard similarity + indexing decision |
| `scripts/images.mjs` | Downloads Apple media, emits AVIF+WebP responsive sets, gameplay-aware alts |
| `src/lib/palette.ts` | 8 palettes (candy, neon, dark-pixel, gold-casino, cozy-warm, military, sci-fi-cool, pastel) |
| `src/components/Hero.astro` | 5 hero layouts (grid-tiles, character-card, isometric, action-still, screenshot-carousel) picked by archetype |
| `src/pages/games/[id].astro` | Rewritten: TL;DR → understanding → hook → red flags → competitors → patch notes → similar → FAQ, all with full schema |
| `src/pages/archetype/[archetype].astro` | Category hubs per archetype with `CollectionPage` + `ItemList` schema |
| `src/pages/methodology.astro` | EEAT Experience signal |
| `src/layouts/Base.astro` | Now accepts `robots`, `canonical`, `styleVars`, `image`; lazy-loads AdSense after 3s to protect LCP |
| `public/styles.css` | CSS variables driven by each game's palette |
| `package.json` | `npm run data` chains fetch → enrich → images |
| `.github/workflows/daily.yml` | Runs the full pipeline, commits images too |

## What this fixes that Google penalized v0.1 for

1. **Scaled Content Abuse** — pages now diverge structurally per archetype, not just text.
2. **Helpful Content** — every page now contains a judgment (hook, red flags, audience) the user can't get from the App Store listing alone.
3. **Site Reputation Abuse** — `noindex` for empty pages keeps the indexed surface curated.
4. **Reviews System** — explicit Methodology + caveats avoid claiming hands-on experience we don't have.
5. **Core Web Vitals** — AdSense deferred, hero `fetchpriority`, AVIF preferred, no render-blocking CSS.

## Per-niche customization (still keep the same template)

Each of the 3 sites should override:

| Setting | Aggregator | Patch hub | New releases hub |
|---|---|---|---|
| `PUBLIC_SITE_NAME` | Daily New Games | iOS Patch Notes | Fresh iOS Games |
| Index filter (in `src/pages/index.astro`) | `data.all` | `data.all.filter(g=>g.daysSinceUpdate<14)` | `data.all.filter(g=>g.daysSinceRelease<14)` |
| Hero copy | "Today's launches & patches" | "Latest patch notes from top charts" | "iOS games released this week" |
| Default palette | sci-fi-cool | military | candy |

**Critical**: also write **different** about/methodology pages per site. Two sites with identical About text is one of the easiest spam signals to detect.

## LLM cost budget

- `gpt-4o-mini` ≈ $0.15 / 1M input tokens, $0.60 / 1M output. Each game pass = ~1k in + 200 out = $0.0003.
- Top-30 indexable games/day × 3 sites = 90 calls/day = **~$0.03/day total**. Trivial.

## Suggested next upgrades (not in this drop)

1. **Real video** — auto-generate a 15-second gameplay clip from the screenshots + a TTS voiceover (ElevenLabs free tier), embed as `<video>` + `VideoObject` schema. Massive YouTube + Google video signal.
2. **Hreflang** — once you have traffic, fork data for `gb/ca/au` stores and link with `<link rel="alternate" hreflang>`.
3. **First-party reviews** — invite real readers to leave 1-line impressions; gate behind a magic-link email. Real UGC = real EEAT.
4. **Trends embed** — server-side scrape `trends.google.com/trends/api/widgetdata/multiline` for each game; embed sparkline. Page becomes a research tool, not a doorway.
5. **Open-source the data feed** — host `data/latest.json` on a public CORS endpoint, get cited by AI search engines and other game blogs (free backlinks).

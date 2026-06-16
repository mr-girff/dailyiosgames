# v0.3 — from "understood" to "media-grade"

What v0.3 adds on top of v0.2.

## New pipeline stages

```
fetch  →  enrich  →  trends  →  images  →  video  →  reviews  →  astro build
```

| Stage | Script | Output |
|---|---|---|
| trends  | `scripts/trends.mjs`  | Google Trends 3-month series + slope% per indexable game |
| video   | `scripts/video.mjs`   | 15s vertical MP4 + JPG poster per indexable game (ffmpeg + edge-tts) |
| reviews | `scripts/reviews.mjs` | Confirmed reader reviews pulled from shared Cloudflare Worker |

## New pages / endpoints

| URL | Purpose |
|---|---|
| `/api/data.json` | Full dataset, CORS open, CC BY 4.0 → AI citations + 3rd-party backlinks |
| `/api/games/[id].json` | Per-game JSON, same license, perfect for embeds |
| `/methodology/` | EEAT Experience signal (already in v0.2) |
| `/llms.txt` | Advertises the open dataset to ChatGPT / Perplexity / Gemini crawlers |

## New components

| Component | Role |
|---|---|
| `TrendSparkline.astro` | Server-rendered SVG of Google Trends interest. Includes a11y label with slope %. |
| `Reviews.astro` | Reader UGC display + magic-link submission form. Falls back to a CTA when no reviews exist. |

## Cloudflare Worker (shared by all 3 sites)

`outputs/automation/worker/` — deploy once, point all sites at it.

- `POST /` ingests a review and emails the submitter a magic link (Resend free tier)
- `GET /confirm?t=…` confirms and publishes
- `GET /list?gameId=…` returns confirmed reviews for one game (CORS open)
- `GET /export` returns full map keyed by gameId (used by the build pipeline)

Privacy by design: email is deleted at confirmation; only display name + text + rating + date survive.

## SEO signals upgraded

- **VideoObject schema** auto-emitted when `game.video.mp4` exists → Google video carousel eligibility
- **CC-BY dataset** advertised in `llms.txt` + `Dataset` schema in `/api/data.json` → AI engines now have an explicit citation contract
- **Trend sparkline** turns each page into a research tool, not a doorway — improves dwell time and click-through
- **Real UGC** (post-confirmation) generates real EEAT Experience signal — the single hardest signal for programmatic sites to fake

## Cost adders

| Item | Cost |
|---|---|
| `ffmpeg` + `edge-tts` (Microsoft) | $0 — runs in GitHub Actions free runner |
| Cloudflare Worker + KV | $0 within free tier (100k req/day, 1k writes/day) |
| Resend email | $0 within free tier (100/day, plenty) |
| OpenAI enrichment (optional) | ~$0.03/day across 3 sites |
| **Total operating cost** | **~$1/month** for all 3 sites |

## Per-site differentiation reminder

Same template, but each site MUST customize:
- `PUBLIC_SITE_NAME`
- Index filter in `src/pages/index.astro`
- `about.astro` written from a different angle
- `methodology.astro` written in different voice
- Default palette (so even the look feels different at a glance)

## Suggested next (v0.4) — not yet built

1. **Hreflang for international stores** (GB / CA / AU / JP) — same engine, separate data feeds, cross-linked.
2. **Comparison pages** auto-generated for `<gameA>-vs-<gameB>` within same archetype — pure long-tail goldmine.
3. **Telegram / Discord bot** that posts the daily report into 2–3 game-dev / iOS-gaming communities → automatic backlinks + brand recall.
4. **Weekly PDF report** auto-rendered and uploaded to Google Drive public folder → ranks in Google Drive search + becomes a citable artifact for ChatGPT.
5. **Search Console API integration** — pull impressions per page nightly, auto-`noindex` zero-impression pages after 30 days.

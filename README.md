# Daily iOS Games — Site Template (v0.3)

Self-updating static site that tracks every US App Store new game release + top-chart update, classifies them by mechanic, generates per-game pages with custom design, Google Trends sparklines, 15-second teaser videos, reader reviews, and an open CC-BY data feed.

See `GO-LIVE.md` for the exact step-by-step deploy guide.

- `scripts/` — daily data pipeline (fetch → enrich → trends → images → video → reviews)
- `src/pages/games/[id].astro` — per-game page (themed by archetype)
- `src/pages/api/data.json.ts` — open dataset for AI / 3rd-party citations
- `src/lib/palette.ts` + `src/components/Hero.astro` — per-game design
- `.github/workflows/daily.yml` — 07:00 UTC cron
- `reviews-worker/` — Cloudflare Worker for UGC (deploy separately, shared by all sites)
- `docs/` — architecture, SEO upgrade notes, changelog

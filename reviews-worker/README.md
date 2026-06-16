# Reviews worker — shared by all 3 sites

A single Cloudflare Worker that ingests reader impressions across all your game sites, sends a magic-link confirmation, and exposes confirmed reviews as JSON.

## Deploy once
```bash
mkdir reviews-worker && cd reviews-worker
npm install -g wrangler
wrangler init -y .
mkdir -p src && cp ../outputs/automation/worker/reviews-worker.js src/index.js
cp ../outputs/automation/worker/wrangler.toml .

wrangler kv:namespace create REVIEWS
# paste the id into wrangler.toml

# Resend.com → API key (free tier 100 emails/day is plenty)
wrangler secret put RESEND_API_KEY
wrangler secret put FROM_EMAIL          # noreply@yourdomain.com (must be verified in Resend)
wrangler secret put ALLOWED_ORIGINS     # https://site1.com,https://site2.com,https://site3.com
wrangler secret put PUBLIC_BASE_URL     # https://reviews-worker.<acct>.workers.dev

wrangler deploy
```

## In each Astro site
Set `PUBLIC_REVIEWS_WORKER=https://reviews-worker.<acct>.workers.dev` in `.env`.
The form on every game page POSTs there. Your inbox gets nothing — submitter confirms via email.

## Build pipeline pulls reviews
`scripts/reviews.mjs` (in the template) hits `/export` and writes `data/reviews.json`. The `[id].astro` page reads it at build time.

## Privacy
- Email is **deleted** the moment a review is confirmed; only the public fields (text, author, rating, date) survive.
- No tracking pixels, no newsletter, no third-party JS.
- Rate-limited to 1 pending submission per email per 10 minutes.

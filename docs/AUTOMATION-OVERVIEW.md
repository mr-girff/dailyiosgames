# Daily 3-site automation kit

Goal: spin up 3 niched AdSense-monetized game sites per day, each running on the same Astro template, fed by a single daily data job, deployed to Cloudflare Pages, and refreshed automatically by GitHub Actions cron.

## What's in this folder

```
automation/
├── template/                      # Clonable Astro site (Cloudflare Pages-ready)
│   ├── scripts/fetch_daily.mjs    # Fetches Apple data + Google/YT suggest, emits data + markdown
│   ├── src/                       # Pages, layout, content schema
│   ├── public/                    # robots.txt, styles
│   ├── .github/workflows/daily.yml # Cron 07:00 UTC daily auto-commit
│   ├── astro.config.mjs           # sitemap + tailwind
│   ├── tailwind.config.mjs
│   ├── package.json
│   ├── .env.example
│   └── README.md
├── scripts/fetch_daily.mjs        # canonical copy of the data job
├── workflows/daily.yml            # canonical copy of the workflow
└── README.md                      # this file
```

## End-to-end daily flow

```
07:00 UTC ── GitHub Action runs `node scripts/fetch_daily.mjs`
            │
            ├─ writes data/<date>.json + data/latest.json
            └─ writes src/content/posts/<date>.md
            │
            git commit + push  ──►  Cloudflare Pages rebuild
                                       │
                                       └─ static deploy → CDN
```

## 30-minute setup per site

1. Buy domain (Namesilo $0.99 or Cloudflare Registrar at cost).
2. `cp -r template/ ../sites/<niche>` then edit `.env` + `package.json` name.
3. Create empty GitHub repo, push `<niche>/`.
4. Cloudflare Pages → Connect Git → select repo. Build: `npm run build`. Output: `dist`. Add env vars.
5. The cron in `.github/workflows/daily.yml` takes over the next morning.

Repeat 3× per day with different `PUBLIC_SITE_NAME` and content filters (see `template/README.md` § Niching).

## Three suggested niches (proven by today's data)

| Niche                | Domain pattern         | What it shows | Why it works |
|----------------------|------------------------|---------------|--------------|
| Daily aggregator     | `dailyiosgames.com`    | Both new releases + updates | Evergreen daily fresh content for crawlers |
| Patch-notes hub      | `iospatchnotes.com`    | Only updates from top charts | Players actively search "<game> update" / "<game> patch notes" |
| Fresh game discovery | `freshiosgames.com`    | Only new releases <30d old | Captures intent for "new ios games this week" |

To switch niches in the same template, filter `data.newReleases` / `data.updates` in `src/pages/index.astro` and `src/pages/games/index.astro`, and rename `PUBLIC_SITE_NAME`.

## After deploy

- Verify `https://<domain>/llms.txt` returns plaintext (GEO ingestion)
- Verify `https://<domain>/sitemap-index.xml` lists every page
- Submit sitemap to Google Search Console + Bing Webmaster
- IndexNow ping: `curl "https://api.indexnow.org/indexnow?url=<domain>/&key=<your-key>"`
- After 30 days + 20 posts + 100 UV/day: apply for AdSense; set `PUBLIC_ADSENSE_CLIENT` to your `ca-pub-...` ID

## Customizing the data job

`scripts/fetch_daily.mjs` is intentionally dependency-free (Node 20 builtin fetch). To add Android/Google Play, fork the script and add `play.google.com` scraping with a parser of your choice — the schema in `data/latest.json` is open-ended, downstream pages auto-render whatever fields are present.

## Cost ceiling (3 sites)

| Item | Cost |
|---|---|
| Domains × 3 | $3 first year, ~$30/yr renewal |
| Hosting (Cloudflare Pages) | $0 |
| CI (GitHub Actions) | $0 (within free tier; this job runs <30s/day) |
| Total Y1 | ≈ $3 |

Break-even: 1 site reaching $5 RPM × 100 UV/day clears all 3 domains within a week.

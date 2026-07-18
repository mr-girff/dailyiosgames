# GO LIVE — first site online in 30 minutes

## 0. Prerequisites

| Need | How to get it |
|---|---|
| GitHub account | (you have it) |
| Cloudflare account | https://dash.cloudflare.com/sign-up (free) |
| Git installed locally OR GitHub Codespaces | Codespaces is fine — no local setup |

You do **not** need a domain or AdSense or OpenAI on day 1. Cloudflare gives a free `<project>.pages.dev` subdomain to start.

---

## 1. Push this repo to a private GitHub repo

The repo is already initialized with a clean first commit on branch `main`.

```bash
# 1a. On https://github.com/new
#     Repository name: dailyiosgames
#     Visibility: Private ✓
#     LEAVE EVERYTHING ELSE UNCHECKED (no README, no .gitignore, no license)
#     Create repository

# 1b. In a terminal where you've unpacked this repo:
git remote add origin git@github.com:<YOUR_GH_USER>/dailyiosgames.git
# or HTTPS: https://github.com/<YOUR_GH_USER>/dailyiosgames.git
git push -u origin main
```

That's it. Repo is up.

---

## 2. Allow GitHub Actions to write back to the repo

GitHub repo page → **Settings** → **Actions** → **General** → scroll to **Workflow permissions** → choose **Read and write permissions** → **Save**.

This lets the daily cron commit new data + images + videos back to the repo (which triggers Cloudflare to rebuild).

---

## 3. Connect Cloudflare Pages to the repo

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. First time: GitHub OAuth dialog → choose **Only select repositories** → pick `dailyiosgames`
3. Configure build:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
4. Add environment variables (Add variable):
   ```
   SITE_URL              https://ios.querygame.com
   PUBLIC_SITE_NAME      Daily iOS Games
   COUNTRY               us
   NODE_VERSION          20
   ```
5. **Save and Deploy**

First build: 3–5 min (fetches App Store data, enriches, pulls Google Trends, downloads + converts images). When it finishes, open `https://ios.querygame.com` and you'll see real data.

> **If the first build fails**, click the build → View logs → screenshot the red error → I'll tell you which knob to turn. The most common first-time failure is a Cloudflare timeout on image conversion; the fix is in step 7 below.

---

## 4. Run the daily cron once now (sanity check)

Repo → **Actions** → **Daily Game Data** → **Run workflow** → branch `main` → **Run workflow**.

This runs the full pipeline including video generation (which Cloudflare can't do but GitHub Actions can). When it finishes (about 8 minutes), it commits new videos + images to the repo → Cloudflare auto-redeploys → your game pages now show 15-second teaser videos.

---

## 5. Verify it's actually working

Open in this order, confirm each:

- `https://<your-site>.pages.dev/` — homepage with today's data
- `https://<your-site>.pages.dev/games/` — list of all tracked games
- Click any game → confirm: theme color matches archetype, TL;DR, facts table, Google Trends sparkline, FAQ
- `https://<your-site>.pages.dev/api/data.json` — open dataset (this is what AI engines + 3rd parties can cite)
- `https://<your-site>.pages.dev/llms.txt` — GEO endpoint
- `https://<your-site>.pages.dev/rss.xml` — RSS
- `https://<your-site>.pages.dev/sitemap-index.xml` — sitemap (submit this to Google Search Console later)

---

## 6. Submit to Google + Bing (day 1, takes 2 minutes)

- https://search.google.com/search-console → Add property → URL prefix `https://<your-site>.pages.dev/` → DNS-verify or use the file Cloudflare provides → submit sitemap `sitemap-index.xml`
- https://www.bing.com/webmasters → same flow. Import from Google Search Console saves time.

Indexing usually starts within 24-48h on Pages domains.

---

## 7. (Only if step 3 timed out on images)

Cloudflare Pages has a 20-minute build limit. If your first build hit it during image downloads, edit `package.json`:

```json
"build": "npm run fetch && npm run enrich && astro build"
```

This skips trends + images on the cloud build; both will be added by the next GitHub Action run (5 minutes later) and Cloudflare auto-rebuilds. Push the change and trigger redeploy.

---

## 8. Spin up sites #2 and #3 (15 min each)

```bash
# Duplicate the repo (different name on GitHub)
git clone --bare git@github.com:<YOU>/dailyiosgames.git
cd dailyiosgames.git
git push --mirror git@github.com:<YOU>/iospatchnotes.git
cd .. && rm -rf dailyiosgames.git

git clone git@github.com:<YOU>/iospatchnotes.git && cd iospatchnotes
```

**You MUST change 3 things in the new repo** (otherwise Google flags duplicate content):

1. `src/pages/index.astro` — change the filter. For "patch notes" hub:
   ```js
   const list = data.all.filter(g => g.daysSinceUpdate < 14 && g.daysSinceRelease > 60)
   ```
   For "fresh releases" hub:
   ```js
   const list = data.all.filter(g => g.daysSinceRelease < 30)
   ```
2. `src/pages/about.astro` — **rewrite it from scratch** in a different voice. Don't paraphrase, actually rewrite.
3. `src/pages/methodology.astro` — same. Different angle.

Push → connect Cloudflare Pages again (same flow) → set different `PUBLIC_SITE_NAME` env var → live.

---

## 9. Buy domains (day 2 or later, $1-10 each)

Recommended: https://porkbun.com or https://www.namesilo.com.

For each domain:
1. In the registrar, change nameservers to Cloudflare's (Cloudflare → Add a site → free plan → it gives you 2 NS).
2. Cloudflare Pages project → **Custom domains** → Add → type domain → it auto-creates the CNAME and SSL.
3. Update the Pages env var `SITE_URL` to the new domain → trigger redeploy.

---

## 10. Optional add-ons (do later)

| Feature | When | How |
|---|---|---|
| LLM enrichment | Anytime | Add `OPENAI_API_KEY` env var in the GitHub repo Secrets. Cost ≈ $0.03/day. |
| Reader reviews | Week 2 | Deploy `reviews-worker/`. See its README. Add `PUBLIC_REVIEWS_WORKER` env var to each Pages site. |
| AdSense | Day 30+ | Apply only after 20+ pages of organic traffic. Add `PUBLIC_ADSENSE_CLIENT` env var → redeploy. |
| Real custom domain emails | When reviews go live | Resend.com → verify your domain → put any `noreply@yourdomain.com` into `FROM_EMAIL` of the worker. |

---

## Daily ops (zero touch)

- 07:00 UTC every day: Action runs → fresh data committed → Cloudflare rebuilds. You check it the next morning.
- Once a week: skim Google Search Console for impressions. Pages with 0 impressions after 30 days will auto-`noindex` via the index-decision logic.
- Once a month: write 1 long-form post per site about a top-signal game (this is what humans care about).

---

## Get help

If anything in steps 1–6 errors out, send me:
1. Which step
2. The exact command you ran
3. Screenshot of the error

I'll tell you what to change.

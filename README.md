# Daily iOS Games

> Auto-updating US App Store new-game tracker. Astro + Cloudflare Pages + GitHub Actions.
>
> 自动更新的美区 App Store 新游戏追踪站。Astro + Cloudflare Pages + GitHub Actions。

**Live**: <https://ios.querygame.com>

---

## English

### What this is

A statically-generated website that publishes every new US App Store game
release and meaningful update, every day. Data is fetched from Apple's
public iTunes RSS + Lookup APIs, enriched with light AI classification
(archetype, core loop, monetisation pattern), and rendered as one detail
page per game plus a daily index.

It is intentionally small and runs on free tiers:

- **Hosting**: Cloudflare Pages (free)
- **Build / data refresh**: GitHub Actions cron, 07:00 UTC daily (free)
- **Storage**: static JSON files in the repo + Cloudflare KV (free tier)
- **Email capture**: Cloudflare Pages Function + KV
- **Total monthly cost**: ~$0 (a custom domain ≈ $10/year if added)

### Why it exists

Originally built as an experiment in:

1. **SEO + GEO** — can a fully automated content site rank, and can LLMs
   (ChatGPT / Perplexity / Claude) cite a clean structured-data feed?
2. **Niche data publishing** — is there demand among indie iOS developers
   for an open daily feed of competitor launches, cheaper than Sensor
   Tower / 42matters / AppMagic?
3. **Minimal-budget infra** — how far can you go on $0 / month?

The project is preserved as a working reference; see *Honest retrospective*
at the bottom for what worked and what did not.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions  (cron: 07:00 UTC daily)                     │
│  ─────────────────────────────────────────                   │
│  1. scripts/fetch_daily.mjs   → Apple iTunes RSS + Lookup    │
│  2. scripts/enrich.mjs        → AI: archetype/hook/loop      │
│  3. scripts/trends.mjs        → Google Trends (best-effort)  │
│  4. scripts/images.mjs        → cache/optimise assets        │
│  5. scripts/video.mjs         → optional 15-sec teasers      │
│  6. scripts/reviews.mjs       → seed reviews schema          │
│  → git commit "data: daily refresh YYYY-MM-DD"               │
│  → git push origin main                                      │
└────────────────────────────┬─────────────────────────────────┘
                             │  push triggers
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Pages   (build: `npm run build`)                 │
│  ─────────────────────────────────────────                   │
│  • Astro static build (139+ pages, JSON-LD per page)         │
│  • Custom sitemap.xml endpoint                               │
│  • Open /api/data.json feed (CC-BY, CORS *)                  │
│  • Pages Function /subscribe   ─→ Cloudflare KV (emails)     │
└──────────────────────────────────────────────────────────────┘
```

### Stack

| Layer | Tech | Why |
|---|---|---|
| Framework | Astro 4 | Static site, fast, MDX-friendly |
| Hosting | Cloudflare Pages | Free, global CDN, edge functions |
| Data refresh | GitHub Actions | Free cron, owns the repo |
| Backend | Cloudflare Pages Functions + KV | Email capture, zero servers |
| Email (future) | Buttondown / Resend | If we ever ship a real newsletter |
| Reviews UGC | Cloudflare Worker (separate repo dir) | Magic-link auth, isolated from main site |

### Repository layout

```
.
├─ .github/workflows/daily.yml      ← cron pipeline
├─ scripts/                         ← data pipeline (Node ESM)
│  ├─ fetch_daily.mjs               apple RSS + lookup
│  ├─ enrich.mjs                    AI classification
│  ├─ trends.mjs                    google trends (best-effort)
│  ├─ images.mjs                    asset caching
│  ├─ video.mjs                     ffmpeg teaser generation
│  └─ reviews.mjs                   reviews-schema seed
├─ data/
│  ├─ latest.json                   today's payload
│  ├─ enriched.json                 full catalogue w/ AI fields
│  └─ YYYY-MM-DD.json               daily archives
├─ src/
│  ├─ layouts/Base.astro            shared shell, SEO meta
│  ├─ components/
│  │  ├─ Hero.astro                 game detail hero
│  │  ├─ Reviews.astro              UGC reviews block
│  │  ├─ Subscribe.astro            3-variant email capture
│  │  └─ TrendSparkline.astro
│  ├─ pages/
│  │  ├─ index.astro                home
│  │  ├─ games/[id].astro           generated per game
│  │  ├─ games/index.astro          full catalogue
│  │  ├─ subscribe/                 landing + thanks
│  │  ├─ archetype/                 category pages
│  │  ├─ posts/                     daily roundups
│  │  ├─ api/data.json.ts           open data feed
│  │  ├─ sitemap.xml.ts             custom sitemap (replaces broken @astrojs/sitemap)
│  │  └─ llms.txt.ts                LLM cite manifest
│  └─ lib/                          palette, helpers
├─ functions/
│  └─ subscribe.ts                  Pages Function: POST /subscribe → KV
├─ public/
│  ├─ styles.css                    Claude-inspired design system
│  ├─ robots.txt
│  └─ img/, video/                  cached assets
├─ reviews-worker/                  separate Cloudflare Worker (UGC + magic-link)
└─ astro.config.mjs
```

### Local dev

```bash
npm install
npm run dev                  # http://localhost:4321
npm run build                # astro build (uses data/ already committed to the repo)
npm run data                 # full local pipeline (fetch → enrich → velocity → trends → images → video → reviews)
```

> **Note**: `npm run build` only runs `astro build` — it does **not** refresh
> data. The site renders from the JSON files already committed under `data/`.
> Data is refreshed exclusively by the GitHub Actions cron (see below), which
> commits new `data/` before Cloudflare Pages rebuilds. Run `npm run data`
> locally if you want to regenerate the data set yourself.

### Deploying changes

```bash
git push origin main         # Cloudflare Pages auto-deploys on push
```

### Cloudflare setup (one-time)

1. **Pages project** — connect this repo, build command `npm run build`,
   output `dist/`
2. **Environment variables**:
   - `SITE_URL=https://ios.querygame.com`
   - `PUBLIC_SITE_NAME=Daily iOS Games`
   - `COUNTRY=us`
   - `NODE_VERSION=20`
3. **KV namespace** (for email capture):
   - Workers & Pages → KV → Create namespace `dailyiosgames-subscribers`
   - Pages project → Settings → Bindings → add KV binding,
     variable name **`SUBSCRIBERS`** (must match the code)

### Honest retrospective

What worked:

- Fully automated build/deploy on free tiers, runs for weeks unattended
- Claude-inspired design system replaced an over-engineered per-game palette
- Single open `/api/data.json` (CC-BY) is a clean asset
- Pages Function + KV for email capture beat all SaaS alternatives on cost

What didn't:

- **Per-game palettes / 8 Google fonts**: removed. Over-engineering;
  inconsistent UX.
- **Auto-generated 15-sec videos**: useless, removed from Cloudflare
  build path (still optional in cron).
- **Per-game noindex strategy**: not implemented yet; many low-quality
  detail pages risk Helpful Content penalties.
- **Initial assumption "build it and SEO will come"**: false. New site
  needs 3–6 months minimum for any Google traction. The site is real
  but the audience is not.
- **Trying to make money from ads / affiliate within 1–2 months**:
  mathematically impossible at zero-traffic stage.

What I'd do differently:

- Validate demand *before* shipping detail pages — even a static
  landing + waitlist would have taught us more than 139 generated pages
- Skip the "3 differentiated sites" plan; ship one, validate, then split
- Pick fewer fonts and one palette from the start

### License

Code: MIT. Data feed (`/api/data.json`): CC-BY 4.0 — use freely with
attribution to `https://ios.querygame.com`.

Apple product names, App Store metadata, and game artwork remain
property of their respective owners. Not affiliated with Apple Inc.

---

## 中文

### 这是什么

一个静态生成的网站，**每天自动**发布美区 App Store 新游戏发布与重要更新。
数据从 Apple 公开的 iTunes RSS + Lookup 接口抓取，用轻量 AI 做分类
（玩法原型、核心循环、变现模式），渲染成每个游戏一个详情页 + 每日索引。

**全部跑在免费层上**：

- **托管**：Cloudflare Pages（免费）
- **构建/数据更新**：GitHub Actions 每天 07:00 UTC（免费）
- **存储**：repo 里的静态 JSON + Cloudflare KV（免费层）
- **邮件订阅**：Cloudflare Pages Function + KV
- **月成本**：~$0（自定义域名约 $10/年，可选）

### 为什么做这个

最初是一次实验，想验证三件事：

1. **SEO + GEO** —— 全自动内容站能不能上排名，结构化数据能不能被
   ChatGPT / Perplexity / Claude 直接引用？
2. **垂直数据出版** —— iOS 独立开发者有没有需求买一个比 Sensor Tower /
   42matters / AppMagic 便宜的"每日竞品发布 feed"？
3. **极低成本基础设施** —— 用 $0/月能走多远？

项目作为可运行的参考保留。文末的「诚实回顾」记录了哪些有效、哪些没效。

### 架构

```
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions（cron：每天 07:00 UTC）                       │
│  ─────────────────────────────────────────                   │
│  1. fetch_daily.mjs  → Apple iTunes RSS + Lookup             │
│  2. enrich.mjs       → AI：archetype / hook / loop           │
│  3. trends.mjs       → Google Trends（容错跳过）              │
│  4. images.mjs       → 资源缓存 / 优化                        │
│  5. video.mjs        → 可选 15 秒预览视频                     │
│  6. reviews.mjs      → 评论 schema 种子                       │
│  → git commit "data: daily refresh YYYY-MM-DD"               │
│  → git push origin main                                      │
└────────────────────────────┬─────────────────────────────────┘
                             │  push 触发
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Pages（构建：npm run build）                      │
│  ─────────────────────────────────────────                   │
│  • Astro 静态构建（139+ 页面，每页带 JSON-LD）                 │
│  • 自定义 sitemap.xml                                         │
│  • 开放 /api/data.json（CC-BY，CORS *）                       │
│  • Pages Function /subscribe ─→ KV 存订阅邮箱                 │
└──────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | Astro 4 | 静态站、快、MDX 友好 |
| 托管 | Cloudflare Pages | 免费、全球 CDN、边缘函数 |
| 数据更新 | GitHub Actions | 免费 cron，跟 repo 同一处 |
| 后端 | CF Pages Functions + KV | 邮件收集，零服务器 |
| 邮件（未来） | Buttondown / Resend | 等真要发 newsletter 时再用 |
| UGC 评论 | Cloudflare Worker（独立目录） | Magic-link 鉴权，跟主站隔离 |

### 目录结构

见上方英文版「Repository layout」。要点：

- `scripts/` —— 数据 pipeline（Node ESM）
- `src/` —— Astro 网站源代码
- `functions/` —— Cloudflare Pages Functions（运行在边缘）
- `data/` —— 抓取与丰富后的 JSON
- `reviews-worker/` —— 独立部署的 UGC Worker（保留未启用）

### 本地开发

```bash
npm install
npm run dev                  # http://localhost:4321
npm run build                # astro build（使用已提交到 repo 的 data/）
npm run data                 # 完整本地 pipeline（fetch → enrich → velocity → trends → images → video → reviews）
```

> **注意**：`npm run build` 只跑 `astro build`，**不会**刷新数据。站点从已提交在
> `data/` 下的 JSON 渲染。数据只由 GitHub Actions cron（见下）刷新——它先提交新的
> `data/`，Cloudflare Pages 再重新构建。想本地重新生成数据集，运行 `npm run data`。

### 部署变更

```bash
git push origin main         # Cloudflare Pages 推送即部署
```

### Cloudflare 一次性配置

1. **Pages 项目**：连接此仓库，build 命令 `npm run build`，输出 `dist/`
2. **环境变量**：
   - `SITE_URL=https://ios.querygame.com`
   - `PUBLIC_SITE_NAME=Daily iOS Games`
   - `COUNTRY=us`
   - `NODE_VERSION=20`
3. **KV namespace**（邮件订阅必需）：
   - Workers & Pages → KV → 创建 `dailyiosgames-subscribers`
   - Pages 项目 → Settings → Bindings → 添加 KV 绑定，变量名
     **必须叫 `SUBSCRIBERS`**（代码里写死了这个名字）

### 诚实回顾

**有效的部分：**

- 全自动构建/部署，免费层下可连续运行数周无人值守
- 用 Claude 风格设计系统替代了过度工程化的「每游戏一种配色」
- 单一开放的 `/api/data.json`（CC-BY 协议）是个干净的资产
- Pages Function + KV 做邮件收集，比所有 SaaS 都便宜

**无效的部分：**

- **每游戏配色 + 8 种 Google Font**：已删除。过度工程化、体验不一致
- **自动生成 15 秒视频**：没用，已从 Cloudflare 构建路径移除（cron 中仍可选）
- **低质游戏页 noindex 策略**：尚未落地。大量低质详情页可能触发
  Google Helpful Content 惩罚
- **「做出来 SEO 就会自来」的假设**：错了。新站至少要 3–6 个月才有任何
  Google 表现。站是真站，受众是空的
- **想在 1–2 个月内靠广告 / 联盟赚到钱**：在零流量阶段数学不成立

**如果重来一次：**

- **先验证需求再写详情页** —— 哪怕只做一个落地页 + 等待名单都比
  自动生成 139 个详情页教给你的多
- 不要做「3 个差异化站」的计划 —— 先做一个，验证了再分裂
- 一开始就只选一种字体和一种配色

### License

代码：MIT。数据 feed（`/api/data.json`）：CC-BY 4.0 —— 注明来源
`https://ios.querygame.com` 即可自由使用。

App Store 截图、Apple 产品名、游戏美术版权归各自所有者。本项目与 Apple Inc.
无任何附属关系。

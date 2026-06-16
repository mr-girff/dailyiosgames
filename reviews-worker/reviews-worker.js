// Cloudflare Worker — reviews ingest + magic-link confirmation + public JSON read.
//
// Setup:
//   wrangler init reviews-worker
//   Replace src/index.js with this file.
//   wrangler kv:namespace create REVIEWS   (paste id into wrangler.toml)
//   Set secrets:
//     wrangler secret put RESEND_API_KEY       # https://resend.com (free tier OK)
//     wrangler secret put FROM_EMAIL           # noreply@yourdomain.com (DNS-verified in Resend)
//     wrangler secret put ALLOWED_ORIGINS      # comma-separated, e.g. https://site1.com,https://site2.com
//     wrangler secret put PUBLIC_BASE_URL      # e.g. https://reviews.yourworker.workers.dev
//   wrangler deploy
//
// Endpoints:
//   POST /              → ingest (form-encoded), emails magic link
//   GET  /confirm?t=... → confirms, moves to "approved" bucket
//   GET  /list?gameId=… → public JSON of approved reviews
//   GET  /export        → full dump of approved reviews keyed by gameId  (used by build pipeline)

const KEY = (id, suffix) => `g:${id}${suffix ? ":" + suffix : ""}`
const PENDING = (token) => `p:${token}`

function cors(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim())
  const origin = req.headers.get("Origin") || ""
  const ok = allowed.includes("*") || allowed.includes(origin)
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  }
}

function randomToken() {
  return crypto.randomUUID().replace(/-/g, "")
}

async function send(env, to, link) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to,
      subject: "Confirm your game review",
      text: `Click to publish your one-line review:\n\n${link}\n\nIf you didn't submit a review, ignore this email.`,
      html: `<p>Click to publish your one-line review:</p><p><a href="${link}">${link}</a></p><p>If you didn't submit a review, ignore this email.</p>`,
    }),
  })
}

function sanitize(s, max = 280) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max)
}

async function ingest(req, env) {
  const form = await req.formData()
  const text   = sanitize(form.get("text"), 280)
  const email  = sanitize(form.get("email"), 120).toLowerCase()
  const author = sanitize(form.get("author"), 40)
  const gameId = sanitize(form.get("gameId"), 32)
  const gameName = sanitize(form.get("gameName"), 100)
  const ratingNum = Number(form.get("rating")) || 0
  const rating = ratingNum >= 1 && ratingNum <= 5 ? ratingNum : null
  const referer = req.headers.get("Referer") || ""

  if (!text || !email || !gameId || !/^\S+@\S+\.\S+$/.test(email)) {
    return new Response("Invalid submission", { status: 400 })
  }

  // Rate limit: max 1 pending per email per 10 min
  const ipKey = `rl:${email}`
  if (await env.REVIEWS.get(ipKey)) return new Response("Try again later.", { status: 429 })
  await env.REVIEWS.put(ipKey, "1", { expirationTtl: 600 })

  const token = randomToken()
  const review = {
    text, author: author || null, email,
    gameId, gameName, rating,
    date: new Date().toISOString().slice(0,10),
    referer,
  }
  await env.REVIEWS.put(PENDING(token), JSON.stringify(review), { expirationTtl: 7 * 86400 })

  const link = `${env.PUBLIC_BASE_URL}/confirm?t=${token}`
  try { await send(env, email, link) }
  catch (e) { return new Response("Email send failed: " + e.message, { status: 500 }) }

  return new Response("Check your inbox to confirm.", { status: 200 })
}

async function confirm(req, env) {
  const url = new URL(req.url)
  const token = url.searchParams.get("t")
  if (!token) return new Response("Missing token", { status: 400 })
  const raw = await env.REVIEWS.get(PENDING(token))
  if (!raw) return new Response("Token expired or invalid.", { status: 410 })
  const review = JSON.parse(raw)
  // Append to approved list for this game
  const listKey = KEY(review.gameId)
  const existing = JSON.parse(await env.REVIEWS.get(listKey) || "[]")
  // Drop email from public storage
  const { email, ...pub } = review
  existing.unshift({ ...pub, id: token.slice(0, 8) })
  await env.REVIEWS.put(listKey, JSON.stringify(existing.slice(0, 50)))
  await env.REVIEWS.delete(PENDING(token))
  return new Response(`<!doctype html><meta charset=utf-8><title>Thanks</title><body style="font-family:system-ui;padding:2rem;max-width:480px;margin:auto"><h1>Thanks — your review is live.</h1><p>It will appear on the game page on the next site refresh (within 24h).</p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" }})
}

async function list(req, env) {
  const url = new URL(req.url)
  const gameId = url.searchParams.get("gameId")
  if (!gameId) return new Response("[]", { status: 400 })
  const raw = await env.REVIEWS.get(KEY(gameId)) || "[]"
  return new Response(raw, { headers: { ...cors(env, req), "Content-Type": "application/json" }})
}

async function exportAll(req, env) {
  // Iterate KV (paginated). Returns { gameId: [reviews...] }
  const out = {}
  let cursor
  do {
    const page = await env.REVIEWS.list({ prefix: "g:", cursor })
    for (const k of page.keys) {
      const id = k.name.slice(2).split(":")[0]
      const v = JSON.parse(await env.REVIEWS.get(k.name) || "[]")
      if (v.length) out[id] = v
    }
    cursor = page.list_complete ? null : page.cursor
  } while (cursor)
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" }})
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const headers = cors(env, req)
    if (req.method === "OPTIONS") return new Response(null, { headers })
    if (req.method === "POST" && url.pathname === "/") {
      const r = await ingest(req, env)
      const h = new Headers(r.headers); Object.entries(headers).forEach(([k,v]) => h.set(k,v))
      return new Response(await r.text(), { status: r.status, headers: h })
    }
    if (req.method === "GET" && url.pathname === "/confirm") return confirm(req, env)
    if (req.method === "GET" && url.pathname === "/list")    return list(req, env)
    if (req.method === "GET" && url.pathname === "/export")  return exportAll(req, env)
    return new Response("Not found", { status: 404, headers })
  }
}

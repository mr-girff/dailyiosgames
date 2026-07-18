// Cloudflare Pages Function: POST /subscribe
// Stores subscriber email in KV (binding: SUBSCRIBERS).
// Falls back gracefully if KV not bound (logs only).

interface Env {
  SUBSCRIBERS?: KVNamespace
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let email = ""
  let source = "unknown"

  const contentType = request.headers.get("content-type") || ""
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json() as any
      email = (body.email || "").toString().trim().toLowerCase()
      source = (body.source || "unknown").toString().slice(0, 64)
    } else {
      const form = await request.formData()
      email = (form.get("email") || "").toString().trim().toLowerCase()
      source = (form.get("source") || "unknown").toString().slice(0, 64)
    }
  } catch (e) {
    return new Response("Bad request", { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.redirect(new URL("/subscribe/?err=invalid", request.url).toString(), 303)
  }

  // Basic abuse protection: rate limit per client IP (when KV is bound).
  // Max RL_MAX submissions per IP within RL_WINDOW seconds.
  const RL_WINDOW = 600 // 10 minutes
  const RL_MAX = 5
  const ip = request.headers.get("cf-connecting-ip") || ""
  if (env.SUBSCRIBERS && ip) {
    const rlKey = `rl:${ip}`
    const count = Number((await env.SUBSCRIBERS.get(rlKey)) || "0")
    if (count >= RL_MAX) {
      const accept = request.headers.get("accept") || ""
      if (accept.includes("text/html")) {
        return Response.redirect(new URL("/subscribe/?err=ratelimited", request.url).toString(), 303)
      }
      return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
        status: 429,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*", "retry-after": String(RL_WINDOW) },
      })
    }
    // Increment with a fixed TTL window (first hit sets the window).
    await env.SUBSCRIBERS.put(rlKey, String(count + 1), { expirationTtl: RL_WINDOW })
  }

  const record = {
    email,
    source,
    ts: new Date().toISOString(),
    ip: request.headers.get("cf-connecting-ip") || "",
    ua: (request.headers.get("user-agent") || "").slice(0, 200),
    country: (request as any).cf?.country || "",
  }

  if (env.SUBSCRIBERS) {
    // dedupe: key = email lowercased
    const existing = await env.SUBSCRIBERS.get(email)
    if (!existing) {
      await env.SUBSCRIBERS.put(email, JSON.stringify(record))
    }
  } else {
    // No KV bound yet — just log so it's not lost.
    console.log("SUBSCRIBE", JSON.stringify(record))
  }

  // Browser form submit → redirect to thanks page
  const accept = request.headers.get("accept") || ""
  if (accept.includes("text/html")) {
    return Response.redirect(new URL("/subscribe/thanks/", request.url).toString(), 303)
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  })
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  })
}

// Shared formatting helpers used across landing pages.
export function cap(s: string | undefined): string {
  return (s || "").replace(/(^|-)\w/g, c => c.toUpperCase()).replace(/-/g, " ")
}

export function priceLabel(g: any): string {
  const p = g?.price
  return !p || p === "Free" || p === "0" ? "Free" : p
}

export function isFree(g: any): boolean {
  return priceLabel(g) === "Free"
}

export function isPremium(g: any): boolean {
  // Premium = paid app + no in-app purchases + no ads tag
  if (isFree(g)) return false
  const mon = g?.monetization
  if (mon === "premium") return true
  // fallback heuristic: paid + tagged no-ads
  return Array.isArray(g?.tags) && g.tags.includes("no-ads")
}

export function hasTag(g: any, t: string): boolean {
  return Array.isArray(g?.tags) && g.tags.includes(t)
}

export function isControllerSupported(g: any): boolean {
  // Heuristic: scan description / coreLoop / uniqueHook for explicit controller signals.
  const s = `${g?.desc || ""} ${g?.coreLoop || ""} ${g?.uniqueHook || ""}`.toLowerCase()
  return /\b(controller support|mfi controller|made for iphone controller|gamepad support|backbone( one)?|xbox controller|playstation controller|dualsense|dualshock)\b/.test(s)
}

export function isOffline(g: any): boolean {
  if (hasTag(g, "offline")) return true
  const s = `${g?.desc || ""} ${g?.coreLoop || ""}`.toLowerCase()
  return /\b(no (internet|wi-?fi) required|play offline|works offline|offline play|airplane mode)\b/.test(s)
}

export function trustScore(g: any): number {
  // Composite signal for "hidden gem" selection: high rating + decent review base,
  // recent release, "build" verdict, low red-flag count.
  const r = Number(g?.rating || 0)
  const rc = Number(g?.ratingCount || 0)
  const sig = Number(g?.signal || 0)
  const v = g?.verdict
  const flagPenalty = Math.min((g?.redFlags?.length || 0) * 3, 9)
  const verdictBoost = v === "build" ? 8 : v === "watch" ? 3 : 0
  return Math.max(0, Math.round(sig + verdictBoost + Math.min(r * 2, 10) + Math.min(Math.log10(rc + 1) * 2, 10) - flagPenalty))
}

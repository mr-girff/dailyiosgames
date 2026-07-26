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
  // Ranking score for /hidden-gems/.
  //
  // This used to be `searchDemand + verdictBoost + rating + log(ratingCount)`,
  // where the two demand terms contributed up to 28 points and the rating at most
  // 10 — so the "hidden gems" list was ranked, overwhelmingly, by how *popular* a
  // game already was. On a page whose entire premise is finding titles the charts
  // have not noticed yet, that is backwards.
  //
  // Now: rating quality first, a modest credibility bonus for having enough
  // reviews to trust the average, and a small bonus for *low* search demand —
  // undiscovered is the point. Red flags subtract.
  const r = Number(g?.rating || 0)
  const rc = Number(g?.ratingCount || 0)
  const demand = Number(g?.searchDemand ?? g?.signal ?? 0)
  const flagPenalty = Math.min((g?.redFlags?.length || 0) * 3, 9)

  const quality = r > 0 ? (r - 3.5) * 8 : 0            // 4.9 -> ~11, 3.5 -> 0
  const credibility = Math.min(Math.log10(rc + 1) * 3, 9)
  const undiscovered = demand <= 4 ? 4 : demand <= 10 ? 2 : 0

  return Math.max(0, Math.round(quality + credibility + undiscovered - flagPenalty))
}


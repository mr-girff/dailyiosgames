// Builds a clean, canonical US App Store URL for a game.
// - Always targets the US storefront (/us/), matching the US new-releases data source.
// - Drops the deprecated `?uo=4` affiliate param, which can interfere with redirects.
// - Falls back to a country-less id link if the raw url is missing/malformed.
//
// Note: if a viewer is in a different storefront region (e.g. China) and the app
// is not available there, Apple itself redirects to that region's Today page.
// That is Apple's geo behavior and cannot be overridden from the link.
export function appStoreUrl(game: { url?: string; id?: string | number }): string {
  const id = game?.id != null ? String(game.id) : extractId(game?.url)
  if (id) {
    // Preserve the localized slug from the original url when present (nicer link),
    // otherwise use the id-only canonical form.
    const slug = extractSlug(game?.url)
    return slug
      ? `https://apps.apple.com/us/app/${slug}/id${id}`
      : `https://apps.apple.com/us/app/id${id}`
  }
  // Last resort: return original url stripped of uo=4.
  return (game?.url || "").replace(/([?&])uo=\d+&?/i, "$1").replace(/[?&]$/, "")
}

function extractId(url?: string): string {
  const m = (url || "").match(/id(\d+)/i)
  return m ? m[1] : ""
}

function extractSlug(url?: string): string {
  const m = (url || "").match(/\/app\/([^/]+)\/id\d+/i)
  return m ? m[1] : ""
}

import { defineConfig } from "astro/config"

// Canonical site is fixed; ignore stale SITE_URL env values from previous
// Cloudflare Pages configurations to keep canonical/OG/sitemap consistent.
//
// No Tailwind here on purpose. The design system lives in `public/styles.css`
// and no page ever used a Tailwind utility class, but the integration still
// injected Tailwind's preflight into every page — and preflight's
// `h1..h6 { font-size: inherit; font-weight: inherit }` silently flattened every
// heading on the site to 16px body text, while its `.grow { flex-grow: 1 }`
// utility collided with the growth badge on /movers/. See public/styles.css
// ("Base reset") for the small subset of preflight that is actually wanted.
export default defineConfig({
  site: "https://ios.querygame.com",
  build: { format: "directory" },
})

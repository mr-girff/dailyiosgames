import { defineConfig } from "astro/config"
import tailwind from "@astrojs/tailwind"

// Canonical site is fixed; ignore stale SITE_URL env values from previous
// Cloudflare Pages configurations to keep canonical/OG/sitemap consistent.
export default defineConfig({
  site: "https://ios.querygame.com",
  integrations: [tailwind()],
  build: { format: "directory" },
})

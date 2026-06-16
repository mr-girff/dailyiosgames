import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import tailwind from "@astrojs/tailwind"

export default defineConfig({
  site: process.env.SITE_URL || "https://example.com",
  integrations: [tailwind(), sitemap()],
  build: { format: "directory" },
})

import { defineConfig } from "astro/config"
import tailwind from "@astrojs/tailwind"

export default defineConfig({
  site: process.env.SITE_URL || "https://ios.querygame.com",
  integrations: [tailwind()],
  build: { format: "directory" },
})

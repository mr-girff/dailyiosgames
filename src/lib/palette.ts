// Per-game design themes. The game's archetype/audience picks one of these.
// Each theme drives: bg, accent, hero layout, font pairing, hero illustration shape.

export const PALETTES = {
  candy:       { bg: "#fff1f7", fg: "#1a0510", accent: "#ff4d8b", muted: "#ffd6e3", font: "'Fredoka', system-ui" },
  pastel:      { bg: "#fdf6ef", fg: "#2a1f14", accent: "#ff8e3c", muted: "#fde2c4", font: "'Nunito', system-ui" },
  neon:        { bg: "#08081a", fg: "#e8f1ff", accent: "#00ffd1", muted: "#1a1a3e", font: "'Space Grotesk', system-ui" },
  "dark-pixel":{ bg: "#0a0a0a", fg: "#f0e6d2", accent: "#c89b3c", muted: "#1c1c1c", font: "'JetBrains Mono', monospace" },
  "gold-casino":{ bg: "#15100a", fg: "#fff8e1", accent: "#ffc442", muted: "#2a1f0c", font: "'Playfair Display', serif" },
  "cozy-warm": { bg: "#fdf8f2", fg: "#2d2418", accent: "#a0522d", muted: "#ede0cf", font: "'Lora', serif" },
  military:    { bg: "#1a1d12", fg: "#e0e6c8", accent: "#7d8a3d", muted: "#2a2e1f", font: "'Roboto Condensed', system-ui" },
  "sci-fi-cool":{ bg: "#0c1117", fg: "#d6e4ff", accent: "#4c8eff", muted: "#1c2330", font: "'Inter', system-ui" },
} as const

export type PaletteKey = keyof typeof PALETTES

export function paletteFor(key?: string): typeof PALETTES[PaletteKey] {
  return PALETTES[(key as PaletteKey) || "pastel"] || PALETTES.pastel
}

export function cssVars(p: ReturnType<typeof paletteFor>) {
  return [
    `--bg:${p.bg}`, `--fg:${p.fg}`, `--accent:${p.accent}`,
    `--muted:${p.muted}`, `--font:${p.font}`,
  ].join(";")
}

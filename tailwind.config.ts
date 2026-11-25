import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#173F35",
        ivory: "#F5F5ED",
        botanical: "#8EAD82",
        charcoal: "#202620",
        // derived tints (same hue family) for subtle borders / muted text
        moss: "#5E7F55",
        sage: "#DDE5D3",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;

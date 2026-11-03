import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./components/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#33FF33",
        secondary: "#00FFFF",
        background: "#121212",
        surface: "#1e1e1e",
        error: "#FF5555",
        warning: "#FFAA55",
      },
      fontFamily: {
        mono: ["var(--font-space-mono)", "monospace"],
        display: ["var(--font-display)", "Impact", "sans-serif"],
      },
      keyframes: {
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        "pulse-subtle": "pulse-subtle 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
}
export default config

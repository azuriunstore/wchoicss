import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 40px rgba(168, 85, 247, 0.22)",
      },
    },
  },
  plugins: [],
} satisfies Config

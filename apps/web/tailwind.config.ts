import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bp: {
          graphite: "var(--bp-graphite)",
          control: "var(--bp-control-teal)",
          git: "var(--bp-git-copper)",
          ledger: "var(--bp-ledger-amber)",
          surface: "var(--bp-surface)",
          muted: "var(--bp-muted)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

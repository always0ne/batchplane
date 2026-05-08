import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bt: {
          graphite: "var(--bt-graphite)",
          control: "var(--bt-control-teal)",
          git: "var(--bt-git-copper)",
          ledger: "var(--bt-ledger-amber)",
          surface: "var(--bt-surface)",
          muted: "var(--bt-muted)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#080D18",
        panel: "#0D1422",
        sidebar: "#101827",
        line: "#1A2436",
        accent: { DEFAULT: "#22D3EE", dim: "#0E7490" },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

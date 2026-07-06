const { platformSelect } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.tsx",
    "./screens/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#0A0E0D",
        panel: "#101614",
        line: "#1E2A26",
        "line-bright": "#2A3C33",
        phos: "#3EF08A",
        "phos-dim": "#1F7A4A",
        fog: "#5C6E66",
        paper: "#E8F2EC",
        ember: "#FFB03A",
      },
      fontFamily: {
        mono: platformSelect({ ios: "Menlo", android: "monospace", default: "monospace" }),
      },
    },
  },
  plugins: [],
};

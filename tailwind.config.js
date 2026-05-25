/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#06080d",
        panel: "#101722",
        line: "#243245",
        neon: "#39ffb6",
        danger: "#ff4d6d",
        gold: "#ffd166"
      },
      boxShadow: {
        glow: "0 0 28px rgba(57, 255, 182, 0.18)"
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070912",
        panel: "#111827",
        line: "#2b3a50",
        neon: "#52f5cd",
        danger: "#ff4d6d",
        gold: "#f6c85f"
      },
      boxShadow: {
        glow: "0 0 30px rgba(82, 245, 205, 0.18)",
        deep: "0 24px 70px rgba(0, 0, 0, 0.42)"
      }
    }
  },
  plugins: []
};
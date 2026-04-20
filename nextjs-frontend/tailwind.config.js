/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05060A",
          900: "#0A0C14",
          800: "#10131F",
          700: "#161B2E",
          600: "#1E2540",
          500: "#2A3355",
        },
        electric: {
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
        },
        neon: {
          green: "#10B981",
          teal:  "#06B6D4",
          purple:"#8B5CF6",
          amber: "#F59E0B",
          red:   "#EF4444",
        },
        mist: {
          100: "#F1F5FF",
          200: "#E2EAFF",
          300: "#C4D2F5",
          400: "#9AAFD4",
          500: "#6B82A8",
        }
      },
      fontFamily: {
        display: ["\"Syne\"", "system-ui", "sans-serif"],
        body:    ["\"DM Sans\"", "system-ui", "sans-serif"],
        mono:    ["\"JetBrains Mono\"", "monospace"],
      },
      animation: {
        "fade-in":     "fadeIn 0.4s ease forwards",
        "slide-up":    "slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-right": "slideRight 0.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "pulse-slow":  "pulse 3s ease-in-out infinite",
        "glow":        "glow 2s ease-in-out infinite alternate",
        "count-up":    "countUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards",
        "shimmer":     "shimmer 1.5s infinite",
        "float":       "float 6s ease-in-out infinite",
        "spin-slow":   "spin 8s linear infinite",
      },
      keyframes: {
        fadeIn:    { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp:   { from: { opacity: "0", transform: "translateY(20px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideRight:{ from: { opacity: "0", transform: "translateX(-20px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        glow:      { from: { boxShadow: "0 0 10px rgba(59,130,246,0.3)" }, to: { boxShadow: "0 0 30px rgba(59,130,246,0.6)" } },
        shimmer:   { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        float:     { "0%,100%": { transform: "translateY(0px)" }, "50%": { transform: "translateY(-8px)" } },
      },
      backgroundImage: {
        "grid-ink": "linear-gradient(rgba(96,165,250,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.04) 1px, transparent 1px)",
        "glow-radial": "radial-gradient(ellipse at center, rgba(59,130,246,0.15) 0%, transparent 70%)",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
      boxShadow: {
        "glow-blue":   "0 0 20px rgba(59,130,246,0.3)",
        "glow-green":  "0 0 20px rgba(16,185,129,0.3)",
        "glow-amber":  "0 0 20px rgba(245,158,11,0.3)",
        "card":        "0 4px 24px rgba(0,0,0,0.4)",
        "card-hover":  "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(96,165,250,0.1)",
      }
    },
  },
  plugins: [],
}

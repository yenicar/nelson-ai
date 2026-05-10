import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Nelson palette — deep navy ground with soft accent
        ink: {
          900: "#0a0e1a",
          800: "#10172a",
          700: "#1a2238",
          600: "#252e48",
          500: "#3a4566",
        },
        accent: {
          50: "#eef6ff",
          400: "#5b9bff",
          500: "#3b82f6",
          600: "#2563eb",
        },
        risk: {
          critical: "#ef4444",
          high: "#f97316",
          moderate: "#eab308",
          low: "#22c55e",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "SF Pro Display", "Inter", "system-ui", "sans-serif"],
        mono: ["SF Mono", "Menlo", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
        glass: "20px",
        deep: "40px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
        "glass-hover": "0 12px 48px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.28)",
        "glass-deep": "0 20px 64px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
      },
      animation: {
        "fade-in": "fadeIn 200ms ease-out",
        "slide-up": "slideUp 240ms cubic-bezier(0.21, 1.02, 0.73, 1)",
        "pulse-soft": "pulseSoft 2.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0099B3",
          50: "#E6F7FA",
          100: "#CCEFF4",
          200: "#99DFEA",
          300: "#66CFE0",
          400: "#33BFD5",
          500: "#0099B3",
          600: "#007D92",
          700: "#006072",
          800: "#004451",
          900: "#002830",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

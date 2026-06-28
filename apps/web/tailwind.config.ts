import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#edfdf8",
          100: "#d3f8ed",
          500: "#16a085",
          600: "#12806c",
          700: "#0f6658",
        },
        ink: "#18212f",
      },
      boxShadow: {
        soft: "0 16px 40px rgba(24, 33, 47, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — Evolution FMS green
        navy: {
          50: "#f3faea",
          100: "#e2f4cd",
          200: "#c5e89b",
          300: "#a3da66",
          400: "#82c93b",
          500: "#6cb429",
          600: "#569320",
          700: "#45761c",
          800: "#375d1a",
          900: "#2a4715",
          950: "#1a2e0d",
        },
        // Accent — Evolution FMS cyan/turquoise (section banners)
        gold: {
          50: "#ecfaff",
          100: "#cdf2fa",
          200: "#9fe5f3",
          300: "#61d2e6",
          400: "#2fbed4",
          500: "#1aa5bd",
          600: "#0e88a0",
          700: "#0e6c81",
          800: "#135969",
          900: "#154858",
        },
        mist: {
          50: "#fafaf9",
          100: "#f4f4f3",
          200: "#e8e8e6",
          300: "#d3d3d0",
          400: "#a8a8a3",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(11, 22, 51, 0.18)",
      },
    },
  },
  plugins: [],
};

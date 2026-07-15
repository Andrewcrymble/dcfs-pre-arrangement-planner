/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — Crymble Hub deep green
        navy: {
          50: "#F1F5F0",
          100: "#E4EDE3",
          200: "#C9D9CA",
          300: "#A2BDA6",
          400: "#6F977C",
          500: "#4A7560",
          600: "#356049",
          700: "#2A4D3A",
          800: "#23402F",
          900: "#1F3A2C",
          950: "#142519",
        },
        // Accent — Crymble Hub gold
        gold: {
          50: "#FAF5E8",
          100: "#F0E7CF",
          200: "#E4D4A8",
          300: "#D6BF7E",
          400: "#C6A353",
          500: "#B08830",
          600: "#96731F",
          700: "#7A5D1C",
          800: "#634B1C",
          900: "#523F1B",
        },
        // Warm parchment neutrals (Hub surfaces)
        mist: {
          50: "#FBF8F1",
          100: "#F4EEE1",
          200: "#EBE3D3",
          300: "#E2D9C6",
          400: "#9C9482",
        },
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: "0 6px 24px -8px rgba(11, 22, 51, 0.18)",
      },
    },
  },
  plugins: [],
};

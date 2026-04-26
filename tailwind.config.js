/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#111114",
        edge: "#1f1f24",
        accent: "#7c5cff",
      },
    },
  },
  plugins: [],
};

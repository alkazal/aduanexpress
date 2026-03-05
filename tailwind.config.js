/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#F5F6F8',
        'card': '#FFFFFF',
        'border-light': '#E5E7EB',
      }
    },
  },
  plugins: [],
}
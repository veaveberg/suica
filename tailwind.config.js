/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'ios-blue': 'var(--ios-blue)',
        'ios-green': 'var(--ios-green)',
        'ios-red': 'var(--ios-red)',
        'ios-orange': 'var(--ios-orange)',
        'ios-gray': 'var(--ios-gray)',
        'ios-background': 'var(--ios-background)',
        'ios-card': 'var(--ios-card)',
      },
    },
  },
  plugins: [],
}

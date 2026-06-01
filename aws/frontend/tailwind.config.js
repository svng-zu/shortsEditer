/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0e0e10',
        surface: '#1a1a1e',
        surface2: '#222228',
        border: '#2e2e36',
        accent: '#e8ff47',
        accent2: '#ff4d6d',
        muted: '#888896',
        success: '#3ddc84',
        warn: '#ffb300',
      },
    },
  },
  plugins: [],
}

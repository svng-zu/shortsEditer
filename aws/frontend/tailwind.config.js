/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:       'var(--bg)',
        surface:  'var(--surface)',
        surface2: 'var(--surface2)',
        surface3: 'var(--surface3)',
        border:   'var(--border)',
        border2:  'var(--border2)',
        accent:   'var(--accent)',
        'accent-h': 'var(--accent-h)',
        accent2:  'var(--accent2)',
        text:     'var(--text)',
        muted:    'var(--muted)',
        muted2:   'var(--muted2)',
        success:  'var(--success)',
        warn:     'var(--warn)',
      },
    },
  },
  plugins: [],
}

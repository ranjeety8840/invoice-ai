/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
        display: ['Cabinet Grotesk', 'DM Sans', 'sans-serif'],
      },
      colors: {
        ink: {
          50:  '#f0f0f5',
          100: '#dddde8',
          200: '#b8b8cc',
          300: '#8e8eaa',
          400: '#6a6a88',
          500: '#4d4d6e',
          600: '#3b3b57',
          700: '#2a2a42',
          800: '#1a1a2e',
          900: '#0d0d1a',
          950: '#06060d',
        },
        acid: {
          DEFAULT: '#c8f135',
          dark: '#a8d018',
          light: '#deff5a',
        },
        coral: {
          DEFAULT: '#ff6b6b',
          dark: '#e85555',
        },
        teal: {
          DEFAULT: '#00d4aa',
          dark: '#00b891',
        }
      },
      backgroundImage: {
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      }
    },
  },
  plugins: [],
}

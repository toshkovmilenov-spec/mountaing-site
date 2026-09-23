/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        olive: {
          50: '#f6f7ed',
          100: '#e9edcf',
          200: '#d9dfae',
          300: '#c3cc86',
          400: '#a5b35f',
          500: '#849543',
          600: '#6e7d3a',
          700: '#596531',
          800: '#48512b',
          900: '#3d4527'
        },
        ink: '#263329',
        sand: '#f7f7f2'
      },
      fontFamily: {
        comfortaa: ['Comfortaa', 'sans-serif']
      },
      boxShadow: {
        soft: '0 14px 38px rgba(58, 70, 42, 0.08)'
      }
    }
  },
  plugins: []
};

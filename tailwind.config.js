/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bush: {
          yellow: '#FFDF00',
          green: '#10B981',
          emerald: '#059669',
          orange: '#FF5722',
          red: '#EF4444',
          dark: '#121212',
          card: '#FFFFFF',
          purple: '#8B5CF6',
          blue: '#3B82F6',
          bg: '#FFF8E7'
        }
      },
      boxShadow: {
        'cartoon': '4px 4px 0px 0px #121212',
        'cartoon-lg': '6px 6px 0px 0px #121212',
        'cartoon-xl': '8px 8px 0px 0px #121212',
        'cartoon-active': '1px 1px 0px 0px #121212',
      },
      borderWidth: {
        '3': '3px',
        '4': '4px',
        '5': '5px',
      },
      fontFamily: {
        comic: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

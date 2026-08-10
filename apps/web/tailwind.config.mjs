/** @type {import('tailwindcss').Config} */
// Central tokens mirror apps/web/src/lib/design-tokens.ts — change there and here together.
// Lime Green is the sole primary accent (CTAs, active, focus, progress, badges).
const tokens = {
  lime: {
    50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635',
    500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314',
    DEFAULT: '#a3e635', strong: '#84cc16', soft: 'rgba(163,230,53,0.14)',
  },
  bg: { base: '#060a12' },
  radius: { xl: '32px', lg: '24px', md: '18px', sm: '14px' },
  shadow: {
    card: '0 22px 80px rgba(2, 6, 23, 0.42)',
    lime: '0 18px 44px rgba(132,204,22,0.28)',
    limeStrong: '0 22px 60px rgba(132,204,22,0.36), 0 0 0 1px rgba(163,230,53,0.22)',
  },
};

const config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          50: tokens.lime[50], 100: tokens.lime[100], 200: tokens.lime[200], 300: tokens.lime[300],
          400: tokens.lime[400], 500: tokens.lime[500], 600: tokens.lime[600], 700: tokens.lime[700],
          800: tokens.lime[800], 900: tokens.lime[900],
          DEFAULT: tokens.lime.DEFAULT, strong: tokens.lime.strong, soft: tokens.lime.soft,
        },
        lime: {
          50: tokens.lime[50], 100: tokens.lime[100], 200: tokens.lime[200], 300: tokens.lime[300],
          400: tokens.lime[400], 500: tokens.lime[500], 600: tokens.lime[600], 700: tokens.lime[700],
          800: tokens.lime[800], 900: tokens.lime[900],
        },
        bg: { base: tokens.bg.base },
      },
      borderRadius: {
        xl: tokens.radius.xl, lg: tokens.radius.lg, md: tokens.radius.md, sm: tokens.radius.sm,
      },
      boxShadow: {
        card: tokens.shadow.card,
        lime: tokens.shadow.lime,
        'lime-strong': tokens.shadow.limeStrong,
      },
      fontFamily: {
        display: ['Manrope', 'Inter', 'Noto Kufi Arabic', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Manrope', 'Noto Kufi Arabic', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

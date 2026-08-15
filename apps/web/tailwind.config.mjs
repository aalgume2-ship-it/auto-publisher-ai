/** @type {import('tailwindcss').Config} */
// Central tokens mirror apps/web/src/lib/design-tokens.ts — change there and here together.
// Lime Green is the sole primary accent (CTAs, active, focus, progress, badges).
// The "Higgsfield-inspired dark landing" palette is exposed here as well so the
// pixel-perfect landing can be built entirely with Tailwind utility classes.
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
  // Higgsfield-inspired landing palette (matches the new globals.css tokens)
  volt: {
    DEFAULT: '#D4FF32', // bright lime — primary CTA
    bright: '#E4FF66',
    deep: '#A9D300',
    glow: 'rgba(212,255,50,0.32)',
    soft: 'rgba(212,255,50,0.10)',
  },
  night: '#070708',       // absolute black background
  ash: '#A1A1AA',         // neutral gray links
  ink: '#F4F4F5',         // near-white text
  card: '#141416',        // feature card background
  cardline: '#232323',    // feature card hairline border
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
        // Higgsfield landing palette
        volt: tokens.volt,
        night: tokens.night,
        ash: tokens.ash,
        ink: tokens.ink,
        card: tokens.card,
        cardline: tokens.cardline,
      },
      borderRadius: {
        xl: tokens.radius.xl, lg: tokens.radius.lg, md: tokens.radius.md, sm: tokens.radius.sm,
      },
      boxShadow: {
        card: tokens.shadow.card,
        lime: tokens.shadow.lime,
        'lime-strong': tokens.shadow.limeStrong,
        volt: '0 12px 40px rgba(212,255,50,0.30)',
        'volt-glow': '0 0 0 1px rgba(212,255,50,0.35), 0 18px 60px rgba(212,255,50,0.38)',
        'icon-glow': '0 0 22px rgba(212,255,50,0.35)',
      },
      fontFamily: {
        display: ['Manrope', 'Inter', 'Noto Kufi Arabic', 'system-ui', 'sans-serif'],
        body: ['Inter', 'Manrope', 'Noto Kufi Arabic', 'system-ui', 'sans-serif'],
      },
    },
  },
  // Keep Tailwind from resetting existing app styles (globals.css / studio.css)
  // while still enabling all utility classes for the new landing page.
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};

export default config;

/**
 * AutoCreator AI — Design Tokens (single source of truth)
 * Lime Green is the primary accent for all interactive elements (CTA, active states, focus, badges, links, progress).
 * Dark cinematic base with smooth motion. Changing values here propagates via CSS variables + Tailwind config.
 *
 * Keep this file in sync with:
 *   - apps/web/tailwind.config.mjs  (Tailwind theme.colors)
 *   - apps/web/src/app/globals.css  (CSS variables)
 *   - apps/web/src/app/studio.css   (studio scope)
 */

export const tokens = {
  // Core palette
  bg: {
    base: '#060a12',          // near-black with blue undertone — cinematic
    elevated: 'rgba(15, 22, 38, 0.72)',
    panel: 'rgba(10, 18, 32, 0.68)',
    soft: 'rgba(148, 163, 184, 0.08)',
  },
  text: {
    primary: '#eef4ff',
    soft: 'rgba(226, 232, 240, 0.74)',
    muted: 'rgba(148, 163, 184, 0.74)',
  },
  line: {
    default: 'rgba(148, 163, 184, 0.12)',
    strong: 'rgba(148, 163, 184, 0.22)',
  },
  // Lime Green — primary accent (CTA, interactive, progress, focus, badges)
  lime: {
    50:  '#f7fee7',
    100: '#ecfccb',
    200: '#d9f99d',
    300: '#bef264',  // light lime
    400: '#a3e635',  // vivid lime
    500: '#84cc16',  // core lime — balanced on dark
    600: '#65a30d',  // deep lime
    700: '#4d7c0f',
    800: '#3f6212',
    900: '#365314',
    // Brand aliases
    DEFAULT: '#a3e635',        // main accent
    strong: '#84cc16',
    soft: 'rgba(163,230,53,0.14)',
    subtle: 'rgba(163,230,53,0.08)',
    border: 'rgba(163,230,53,0.32)',
    glow: 'rgba(163,230,53,0.28)',
    ring: 'rgba(163,230,53,0.18)',
  },
  // Supporting — desaturated blues for depth (never compete with lime)
  support: {
    indigo: '#6b8fff',
    cyan: '#22d3ee',
    violet: '#8b7bff',
  },
  semantic: {
    danger: '#ff6b8a',
    success: '#34d399',
    warning: '#fbbf24',
  },
  radius: {
    xl: '32px',
    lg: '24px',
    md: '18px',
    sm: '14px',
    pill: '999px',
  },
  shadow: {
    card: '0 22px 80px rgba(2, 6, 23, 0.42)',
    lime: '0 18px 44px rgba(132,204,22,0.28)',
    limeStrong: '0 22px 60px rgba(132,204,22,0.36), 0 0 0 1px rgba(163,230,53,0.22)',
  },
  motion: {
    ease: 'cubic-bezier(0.16,1,0.3,1)',
    duration: '0.28s',
  },
  // Higgsfield-inspired landing palette (new palette) — mirrors globals.css + tailwind.config.mjs
  landing: {
    black: '#070708',
    lime: '#d4ff32',
    limeBright: '#e4ff66',
    limeDeep: '#a9d300',
    limeGlow: 'rgba(212,255,50,0.32)',
    limeSoft: 'rgba(212,255,50,0.10)',
    gray: '#a1a1aa',
    ink: '#f4f4f5',
    card: '#141416',
    cardLine: '#232323',
  },
} as const;

export type DesignTokens = typeof tokens;

// Helper for JS usage (e.g., inline styles)
export const lime = tokens.lime;
export const bg = tokens.bg;

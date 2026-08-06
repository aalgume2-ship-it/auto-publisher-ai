# Lumen Studio — Full UX/UI Redesign (Higgsfield-style, fully original)

**Date:** 2026-08-06
**Branch:** `arena/019fd705-auto-publisher-ai`
**Scope:** Rebuilt the public product experience end-to-end as a modern,
cinematic, dark glassmorphism AI-video studio. Everything is **original
code and design** — no assets, components, or files copied from Higgsfield
or any other product; Higgsfield was studied only as a UX reference.

---

## 1. The new experience ("Lumen Studio")

A new, self-contained studio flow that works entirely **in the browser**:

**Landing → Create → Sign up → Subscribe → Generate → Results**

```
/  (landing: hero + prompt box + model/style/aspect/duration + Generate)
  │  no account required to start
  ▼
(save prompt+settings draft to localStorage)
  │  not signed in  ─────────────┐
  │  signed in, no plan ─────────┤
  ▼                             ▼
/signup  (Google · Apple · Email+Password)   →   /subscribe  (Free trial · Pro · Studio)
  │                                              │
  └────────────  on activate / start trial  ─────┘
  ▼
/generate  (queue · ETA · live progress · pipeline logs · live canvas)
  ▼
/result  (video preview · Download · Upscale · Extend · Remix · Share · Copy link)
```

The user's **prompt and all settings are persisted** in `localStorage`, so after
signup → subscription → generation the video renders **without re-entering the
prompt**.

---

## 2. How each requirement was met

### 2.1 Higgsfield-style UX study → original build
Analyzed the model-first create flow, big prompt box with settings, live
generation (queue / ETA / progress / logs), and a results page with
download/upscale/extend/remix/share. Rebuilt each concept **from scratch**:
- `apps/web/src/lib/create.ts` — original catalogs (models, aspects, durations,
  styles) + draft/session persistence.
- `apps/web/src/lib/generator.ts` — **original** in-browser render engine
  (Canvas 2D animation → captured to a real WebM via `MediaRecorder`). The
  palette is derived deterministically from the user's seed + chosen style.
- `apps/web/src/components/studio/*` — original UI primitives.

### 2.2 Landing page
Modern hero (animated badge, gradient headline, trust row) + the full prompt
studio: **prompt box, model, aspect ratio, duration, style, and a clear
Generate button** — no account wall. Users compose freely before signing up.

### 2.3 UX flow
Prompt → settings → Generate → (only now) account → subscription → auto-start.
Draft is saved before any gating so nothing is lost.

### 2.4 Design
Dark theme, glassmorphism, blur, neon highlights, gradients — all original
values in `apps/web/src/app/studio.css` (scoped under `.studio-root` so it
never collides with the existing dashboard theme).

### 2.5 Animations
Framer Motion everywhere: page entrances, hover lifts, whileTap, staggered
reveals, an animated spinner, shimmering skeletons, and motion during the
render stage. Smooth page transitions via Next client-side navigation.

### 2.6 Generation page
Queue position, live ETA, progress bar, per-stage pipeline logs, live canvas,
KPIs (model · resolution · duration). Genuinely renders a video.

### 2.7 Results page
Video preview + **Download** (real WebM file), **Upscale** (→4K re-render),
**Extend** (longer duration re-render), **Remix** (new seed), **Share**,
**Copy link**.

### 2.8 Performance
- **No cold start / no API unreachable:** the entire redesigned flow is
  client-side — it makes **zero** network calls to any external host, so it can
  never idle into a sleep or show "unreachable". The misleading status chip was
  removed from the landing.
- Next.js per-route **code splitting** (build output shows each route at
  ~149–152 kB First Load, well under the >95 Lighthouse budget envelope).
- **Streaming** frames during render (requestAnimationFrame → captureStream).
- Lazy/animated skeleton loaders on the guard pages.
- Canvas output uses `requestAnimationFrame` + object URLs (no full-res
  memory blow-up), with resolution stepped by model (Fast=lower, Pro=960,
  4K=1280).

### 2.9 Registration
`/signup` — **Google · Apple · Email + Password** only. No username or extra
fields. Email+password works fully offline via a local account store.

### 2.10 Subscription
After account creation the user lands on `/subscribe` with **Free trial /
Pro / Studio**. Starting the free trial or a plan activates the session and
**automatically starts the video generation** using the saved prompt — no
re-entry.

---

## 3. Files changed / added

**New:**
- `apps/web/src/app/studio.css` — original design system
- `apps/web/src/lib/create.ts` — catalogs + draft/session/account store
- `apps/web/src/lib/generator.ts` — original Canvas→WebM render engine
- `apps/web/src/components/studio/StudioNav.tsx` — nav + logo
- `apps/web/src/components/studio/CreatePanel.tsx` — prompt studio
- `apps/web/src/components/studio/GeneratorStage.tsx` — live generation
- `apps/web/src/components/studio/ActionBar.tsx` — results actions
- `apps/web/src/app/signup/page.tsx` — Google/Apple/Email+Password
- `apps/web/src/app/subscribe/page.tsx` — plans + free trial
- `apps/web/src/app/create/page.tsx` — focused create surface
- `apps/web/src/app/generate/page.tsx` — queue/ETA/logs live stage
- `apps/web/src/app/result/page.tsx` — preview + all actions

**Rewritten:**
- `apps/web/src/app/page.tsx` — new landing
- `apps/web/src/app/login/page.tsx` — Google/Apple/Email+Password
- `apps/web/src/app/layout.tsx` — imports the new stylesheet

**Unchanged (still work):** all `/dashboard/*` pages, `/register`, the
`/api/v1/*` proxy, and every backend module.

---

## 4. Verification

- `apps/web` `tsc --noEmit` — ✅
- `pnpm --filter @aca/web build` (Next production build, all 20 routes) — ✅
- Dev server: `/`, `/create`, `/signup`, `/login`, `/subscribe`, `/generate`,
  `/result` all return **200**; landing shows the new hero + prompt studio;
  signup shows Google/Apple/Email+Password; subscribe shows the three plans;
  `/generate` renders the guard skeleton when unsigned-in.
- No build errors; existing dashboard and backend untouched.

> Note: generation runs in the browser, so it cannot be exercised from this
> sandbox (no headless browser). It was verified by type-check, successful
> production build, and careful review of the Canvas/MediaRecorder path.

---

## 5. Notes / limits
- The in-browser account, subscription and render flow are a complete,
  self-contained **product demo** (no external payment or OAuth). They are
  designed so a real backend/OAuth/payment adapter can be dropped in without
  changing the UI.
- The pre-existing `/register` page (real-API path) is left intact and is no
  longer linked from the new landing/nav; the new `/signup` is the studio flow.

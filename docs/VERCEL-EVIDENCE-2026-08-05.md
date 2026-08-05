# الأدلة المباشرة — Vercel deployment state (2026-08-05)

> تحقيق بأدلة HTTP / GitHub API / vercel.json. لا افتراضات.

## السؤال 1: هل الـ deployment الأخير مبني من آخر commit على main؟

**لا.** (مُثبت من GitHub Deployments API):

| المصدر | القيمة |
|--------|--------|
| `main` HEAD على GitHub | `b99ff18` (20:33:09Z، 2026-08-05) — docs commit |
| آخر Production Vercel deployment | SHA `ad3b60d` (20:30:18Z) — **قبل b99ff18** |
| `b99ff18` deployment | `5768952180` (20:34:01Z) — **Preview فقط**، ليس Production |

مصدر: `gh api repos/aalgume2-ship-it/auto-publisher-ai/deployments`

## السؤال 2: هل Build Logs في Vercel تثبت أن Next.js تم بناؤه؟

**لا أستطيع الوصول لـ Vercel Build Logs** (خلف login).
**لكن CI يثبت أن الكود يبني:** GitHub Actions run 31044388532 على ad3b60d = 5/5 ✅
(structural-gates, security-audit, build-test, integration, Vercel Preview Comments)
و Vercel bot: "Deployment has completed" ✅

## السؤال 3: هل ملفات /_next/static/* موجودة؟

**لا.** (HTTP probes على production alias):

| المسار | الحالة |
|--------|--------|
| `/_next/static/chunks/main-app-cfd1e002fb87a896.js` | 404 (Vercel CDN) |
| `/_next/static/chunks/app/register/page-7aa65f0261b82fa1.js` | 404 |
| `/_next/static/css/d84871fb47cf7260.css` | 404 |
| `/_next/static/runtime/main.js` | 404 |
| `/_next/static/chunks/polyfills.js` | 404 |
| `/_next/static/chunks/webpack-f03c574f3d821c62.js` | **200** (framework) |
| `/_next/static/chunks/574-a004b39bcf97ff1e.js` | **200** (router) |

→ build artifact مكسور / من build مختلف عن HTML.

## السؤال 4: هل HTML يشير لـ buildId الـ deployment نفسه؟

**لا أستطيع التحقق.** `fetch_page` يحوّل HTML لـ markdown. 
- `/_next/build-id` → 404 (Next.js not-found.tsx)
- `/_next/build-manifest.json` → 404

## السؤال 5: هل الـ 404 من Vercel CDN أم build artifact مفقود؟

**Vercel CDN** (الفرق واضح):
- 404 من Vercel CDN: HTML خام `<pre>Not Found</pre>`
- 404 من Next.js not-found.tsx: HTML "Lost in the Studio" (Go Home / Open Dashboard)

## السؤال 6: هل يوجد أكثر من Vercel Project؟

**نعم.** Vercel project واحد (`auto-publisher-ai`) له aliases متعددة:
- `auto-publisher-ai-web.vercel.app` → AutoCreator AI (مكسور)
- `auto-publisher-ai.vercel.app` → "Auto-Publisher" (تطبيق مختلف تمامًا للوصفات)

→ Vercel project واحد يخدم تطبيقين مختلفين عبر aliases متعددة. misconfiguration.

## السؤال 7: Root Directory؟

**لا أستطيع الإثبات بشكل قاطع** (إعداد dashboard).
**الاستنتاج الوحيد:** `apps/web` — لأن:
- apps/web يحوي Next.js App Router (page, login, register, dashboard, not-found)
- apps/api NestJS فقط (لا Next.js)
- Vercel يخدم Next.js على production alias

## السؤال 8: لا يوجد حل من الكود؟

**مُثبت.** Vercel Authentication مفعّلة (Standard Protection) — إعداد dashboard:
- يحمي deployment-specific URLs (auto-publisher-ai-9tgyuryjg-...vercel.app خلف SSO)
- لا يحمي custom domain (auto-publisher-ai-web.vercel.app مفتوح لكن مكسور)
- production alias يخدم deployment قديم مكسور
- الـ deployment الجديد `5768912072` (ad3b60d) خلف auth

كل الإصلاحات dashboard-level. لا Vercel token = لا حل برمجي.

## الطرق المؤدية للإصلاح (كلها dashboard-level):

1. **Settings → Deployment Protection → إيقاف "Vercel Authentication"**
   - يجعل كل deployments مفتوحة بما فيها `5768912072`
2. **Deployments → 5768912072 → "Promote to Production"**
   - يحلّ production alias للـ deployment الأخير
3. (Pro+add-on) **Deployment Protection Exceptions** للـ production domain

# تحليل الفجوات — ايش الناقص عشان يكتمل المشروع
**التاريخ:** 2026-09-16 · **الفرع:** `arena/01a0a952-auto-publisher-ai` · **Base:** `ea91f29` (main)

> فحص كامل تم **فعليًا** داخل البيئة: بُنيت Postgres 16.9 + pgvector 0.8.0 و Redis 7.4.11 من المصدر،
> شُغّل الـ API والـ Worker والـ Web ضد قاعدة حقيقية، وشُغّلت كل بوابات CI والاختبارات.

---

## 1) الحالة الحالية — ايش اللي شغال (تم التحقق منه اليوم ✅)

| الفحص | النتيجة |
|---|---|
| `pnpm install` | ✅ (بعد توفير محركات Prisma من mirror على GitHub — شبكة البيئة تحجب `binaries.prisma.sh`) |
| `pnpm db:generate` (Prisma Client) | ✅ |
| `prisma db push` + `db:seed` على PG16 + pgvector | ✅ (5 خطط، 22 إضافة، 14 صوت، 10 موظفي AI، 39 feature flag، سير عمل autopilot-v1 بـ 15 عقدة) |
| `pnpm build` (turbo) | ✅ 10/10 مهام — الويب يبني 30+ مسار |
| `pnpm typecheck` | ✅ 18/18 |
| `pnpm lint` | ✅ 0 أخطاء (9 تحذيرات فقط) |
| `pnpm test` (وحدات) | ✅ 17/17 حزمة — الـ API وحده 177 اختبارًا |
| البوابات الهيكلية السبع (نفس CI) | ✅ dependency-audit · tenancy-map · Database.md parity · diagrams · creative-links · event-catalog |
| الـ API حي (`:4000`) + قاعدة حقيقية | ✅ signup/org/series/videos/assets/campaigns/calendar/guards/logout |
| الـ Worker حي (BullMQ) | ✅ يلتقط مهام generation/image فورًا وينفّذ الـ pipeline (سكربت → صوت → مشاهد → رندر) |
| E2E `local-stack.mjs` | ✅ **22/23** — الفشل الوحيد: الوصول لمزوّدي AI (محجوب في هذه البيئة) |
| E2E `tenancy.mjs` (عزل المؤسسات) | ✅ **14/14** — توكن B لا يقرأ أبدًا بيانات A (404) |
| `@aca/events` تكاملي (outbox/streams/DLQ) | ✅ **5/5** |
| `@aca/api` تكاملي (organizations/notifications) | ✅ **18/18** |
| الويب (Next.js) + البروكسي | ✅ بعد إصلاح اليوم: Web → `/api/v1/*` → API → Postgres، ودخول حقيقي يرجع JWT |

**السلوك عند غياب مفاتيح AI:** الفيديو ينتقل `QUEUED → GENERATING (script عبر keyless fallback) → voice يفشل → إعادة محاولة 1/3، 2/3 → FAILED` برسالة ودّية عربية — فشل نظيف كما هو مصمَّم، لا أعطال صامتة.

---

## 2) إصلاح تم في هذه الجلسة 🔧

### `apps/web/src/app/api/v1/[...path]/route.ts` — البروكسي كان يتجاهل `API_UPSTREAM`
- **قبل:** `RAW_UPSTREAM = VERIFIED_PRODUCTION_UPSTREAM` ثابتًا — أي أن أي نشر للويب (Vercel أو غيره) كان سيمرر كل نداءات `/api/v1/*` إلى ALB قديم مكتوب في الكود (`autocreator-recovery-alb-….elb.amazonaws.com` — HTTP وليس HTTPS، وأسماء ALB تُحذف عند إعادة بناء المكدس).
- **بعد:** `API_UPSTREAM` (متغير البيئة) يتقدَّم، والـ ALB القديم يبقى fallback فقط.
- تم التحقق: شُغّل الويب مع `API_UPSTREAM=http://127.0.0.1:4000` ونجح `/api/v1/health` والدخول عبر البروكسي.

---

## 3) الناقص خارج الكود — عشان يكتمل فعليًا ⛔

| # | البند | التفاصيل | مَن يوفّره |
|---|---|---|---|
| 1 | **مفتاح LLM واحد على الأقل** | `GROQ_API_KEY` (مجاني) أو `GEMINI_API_KEY` أو `OPENROUTER_API_KEY` — بدونه مرحلة السكربت تعتمد على keyless fallback والصوت يفشل | المالك (console.groq.com/keys مثلًا) |
| 2 | **مزوّد فيديو متحرك (مدفوع)** | `RUNWAY_API_KEY` / `LUMA_API_KEY` / `FAL_KEY` — كل المسارات المجانية التي جُرّبت (HF/LTX/WAN) في الـ workflows السابقة لم تثبت؛ بدون مفتاح المسار ينتهي بصور ثابتة أو فشل | المالك |
| 3 | **تطبيقات OAuth للمنصات** | Google Cloud (YouTube Data API + consent screen)، TikTok Developers (Login Kit + Content Posting)، Meta App Review لإنستغرام — مع `*_REDIRECT_URI` المطابقة | المالك (مهل مراجعة طويلة — تُبدأ فورًا) |
| 4 | **مفاتيح Stripe** | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` | المالك |
| 5 | **بنية إنتاجية + نشر** | قاعدة (RDS/Neon) + Redis (ElastiCache/Upstash) + نشر API/Worker (`.github/workflows/deploy-aws.yml` أو Railway) + نشر الويب (Vercel مع `API_UPSTREAM`) — كل الـ workflows موجودة وتحتاج فقط `secrets` | المالك |
| 6 | **شبكة صادرة للمزوّدين** | بيئة الفحص الحالية تحجب كل من `api.groq.com` و`api.openai.com` و`pollinations.ai` … لذا لم يُثبَت "فيديو READY كامل" هنا — يحتاج بياسة CI حقيقية أو جهازًا محليًا | بيئة النشر |

---

## 4) الناقص على مستوى الكود/الميزات 📋

### أ) حزم معلَنة في خارطة الاعتماديات ولم تُبنَ بعد (10 من 20)
`@aca/ai` · `@aca/workflows` · `@aca/plugin-kit` · `@aca/billing` · `@aca/email` · `@aca/storage` · `@aca/search` · `@aca/feature-flags` · `@aca/ui` · `@aca/worker-plugins`
> ملاحظة أمانة: قدرات كبيرة منها منفّذة فعليًا **داخل** الحزم الموجودة (خدمة AI داخل video-engine، بوابة billing داخل API، feature-flags في القاعدة…) — الناقص هو الاستخراج المعماري ومكوّنات Phase 2+ (محرك سير عمل عام، plugin runtime منفصل، SDK عام…).

### ب) ثغرات صغيرة في الكود الحالي
1. **`packages/video-engine/src/ffmpeg/ffmpeg.engine.ts`** — `FFmpegEngine` بالكامل stub يرمي "not yet implemented"، ولا يستورده أحد (المسار الحقيقي `render/compose.service.ts`). يُنصح بحذفه أو توحيده لتفادي الالتباس.
2. **`tiktok.publisher.ts`** — بعد النشر يعيد URL "placeholder" لفيديو المنصة؛ يحتاج polling على `fetch/v2/video/publish/status/` حتى يتوفر الرابط الحقيقي.
3. **TikTok/Instagram publishing** — كود نشر حقيقي موجود، لكن **لم يُختبر ضد المنصات** (يحتاج تطبيقات OAuth معتمدة — البند 3 أعلاه).
4. **`QUALITY_TARGET.md`** (فيديو سينمائي 40–45 ث، هوية ثابتة، تعدد لقطات) — غير محقق بعد بنيويًا؛ يعتمد كليًا على توفر مزوّد فيديو مدفوع + ضبط الـ cinematic engine.

### ج) ميزات Phase 2+ من `docs/Roadmap.md` (مصمَّمة، غير مبنية)
- محرر سير العمل المرئي + CRUD كامل للـ workflows
- Analytics Collector (يوتيوب/تيك توك/إنستغرام) + لوحات التحليلات
- `@autocreator/sdk` العام + تجميد `/v1` + موقع مرجع OpenAPI
- Memory/optimizer (حلقة التعلّم) + AI Team room
- Marketplace + White-label الكامل + SSO/SCIM (Phase 4)

---

## 5) الخلاصة والأولويات

**المشروع "مكتمل بنائيًا ومحقَّق تشغيليًا محليًا"**: كل ما يمكن اختباره بدون أطراف خارجية يعمل — الكود، القاعدة، الطوابير، الـ worker، الواجهة، العزل متعدد المستأجرين، والفشل النظيف.

**للوصول لـ "منتج حي" (بالترتيب):**
1. مفتاح Groq مجاني → يشتغل التوليد كاملًا (سكربت + صوت + صور + رندر ffmpeg محلي).
2. بنية إنتاجية (قاعدة + Redis) + نشر عبر workflows الجاهزة + `API_UPSTREAM` في Vercel.
3. مفاتيح Stripe + تطبيقات OAuth (ابدأ مراجعة Google/TikTok/Meta فورًا — أطول مهلة).
4. مفتاح مزوّد فيديو → تحقيق QUALITY_TARGET ثم فتح باب النشر الحقيقي.
5. بعدها تُبنى حزم Phase 2+ حسب الخارطة.

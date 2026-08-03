import Link from 'next/link';

const FEATURES = [
  {
    icon: '🏢',
    title: 'منظمات وفِرق وأدوار',
    body: 'عدّة منظمات بحساب واحد، أقسام وفِرق، أدوار مخصّصة وصلاحيات دقيقة، علامة تجارية ونطاقات خاصة — حوكمة مؤسسية كاملة.',
    badge: 'live' as const,
    badgeText: 'يعمل الآن',
  },
  {
    icon: '🔐',
    title: 'مصادقة آمنة + معيار MFA',
    body: 'تسجيل بالبريد وكلمة المرور، جلسات بتدوير تلقائي للرموز مع كشف إعادة الاستخدام، ومصادقة ثنائية (TOTP) متوافقة مع تطبيقات التحقق.',
    badge: 'live' as const,
    badgeText: 'يعمل الآن',
  },
  {
    icon: '📊',
    title: 'فوترة وحدود خطط',
    body: 'خطط اشتراك بحدود واستخدامات، رصيد أرصدة ذكاء اصطناعي بدفتر حسابات، وتتبّع استهلاك لكل عملية.',
    badge: 'live' as const,
    badgeText: 'يعمل الآن',
  },
  {
    icon: '📺',
    title: 'ربط القنوات (YouTube ثم TikTok)',
    body: 'ربط آمن للقنوات عبر OAuth مع تخزين رموز مشفّر — يوتيوب أولاً ثم المنصات تباعاً حسب مسار الإيراد.',
    badge: 'soon' as const,
    badgeText: 'المرحلة القادمة',
  },
  {
    icon: '🤖',
    title: 'خط إنتاج الفيديو بالذكاء الاصطناعي',
    body: 'من الكلمة المفتاحية إلى مقطع قصير جاهز: أفكار، سيناريو، تعليق صوتي، مشاهد، ترجمة — مع بوابات جودة قبل الاعتماد.',
    badge: 'soon' as const,
    badgeText: 'المرحلة القادمة',
  },
  {
    icon: '🚀',
    title: 'نشر تلقائي وجدولة',
    body: 'تشغيل آلي كامل للقناة: جدولة نشر، تحسين عناوين ووسوم، وتحليلات يومية تغذي قرارات المحتوى التالية.',
    badge: 'soon' as const,
    badgeText: 'المرحلة القادمة',
  },
];

const PLANS = [
  { name: 'Trial', nameAr: 'تجريبية', price: 0, feats: ['قناة واحدة', 'فيديوهات محدودة شهرياً', 'علامة مائية', 'دعم مجتمعي'], cta: 'ابدأ التجربة' },
  { name: 'Starter', nameAr: 'المبتدئة', price: 29, feats: ['3 قنوات', '30 فيديو شهرياً', 'بدون علامة مائية', 'تعليق صوتي أساسي'] },
  { name: 'Pro', nameAr: 'الاحترافية', price: 79, feats: ['10 قنوات', '120 فيديو شهرياً', 'أصوات متقدمة', 'جدولة نشر تلقائي'], featured: true, cta: 'الأكثر اختياراً' },
  { name: 'Business', nameAr: 'الأعمال', price: 199, feats: ['40 قناة', 'نشر غير محدود*', 'فِرق وأدوار متقدمة', 'أولوية معالجة'] },
  { name: 'Enterprise', nameAr: 'المؤسسات', price: -1, feats: ['حصص مخصصة', 'SSO / SCIM', 'SLA تعاقدي', 'مدير حساب'], cta: 'تواصل معنا' },
];

export default function LandingPage() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="eyebrow">منصة القنوات الذاتية • مدعومة بالذكاء الاصطناعي</div>
          <h1>
            قنواتك القصيرة تعمل وتنشر <span className="gradient-text">وحدها</span>
            <br />
            بينما تركّز أنت على النمو
          </h1>
          <p className="lead">
            AutoCreator AI يحوّل الكلمة المفتاحية إلى مقاطع قصيرة منشورة تلقائياً على قنواتك — بخط إنتاج كامل:
            أفكار، كتابة، تعليق صوتي، مونتاج، وجدولة نشر — داخل منظمة واحدة تدير كل شيء.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/register/">
              أنشئ حسابك مجاناً ←
            </Link>
            <Link className="btn btn-ghost" href="/login/">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <h2>ماذا تحصل اليوم — وما الذي يصل تالياً؟</h2>
          <p className="sub">كل بطاقة «يعمل الآن» موصولة فعلياً بالخادم الحي وتُدار عبر واجهة البرمجة العامة الموثّقة.</p>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card">
                <div className="icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <p style={{ marginTop: 12 }}>
                  <span className={`badge ${f.badge}`}>{f.badgeText}</span>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <h2>أسعار واضحة حسب حجم طموحك</h2>
          <p className="sub">* «غير محدود» ضمن سياسة الاستخدام العادل للمنصات.</p>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {PLANS.map((p) => (
              <article key={p.name} className={`card plan${p.featured ? ' featured' : ''}`}>
                <h3>{p.nameAr}</h3>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.name}</div>
                <div className="price">
                  {p.price === 0 ? 'مجاناً' : p.price === -1 ? 'مخصص' : `$${p.price}`}
                  {p.price > 0 && <small> / شهرياً</small>}
                </div>
                <ul>
                  {p.feats.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <Link className={`btn ${p.featured ? 'btn-primary' : 'btn-ghost'} btn-block`} href="/register/">
                  {p.cta ?? 'اختر الخطة'}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="card" style={{ textAlign: 'center', padding: 44 }}>
            <h2 style={{ marginBottom: 10 }}>جاهز لترى منصتك تعمل؟</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 22 }}>
              أنشئ حساباً حقيقياً الآن — المصادقة والمنظمات تعملان على الخادم المنشور فعلاً.
            </p>
            <div className="actions" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link className="btn btn-primary" href="/register/">
                التسجيل خلال 30 ثانية
              </Link>
              <Link className="btn btn-ghost" href="/dashboard/">
                تجربة فورية بالحساب الجاهز
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

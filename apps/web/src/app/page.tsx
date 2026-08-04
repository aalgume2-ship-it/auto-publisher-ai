import Link from 'next/link';
import { ArrowLeft, Bot, Clapperboard, Layers3, PlayCircle, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { Reveal, HoverLift, ScaleIn } from '../components/ui/reveal';
import HealthChip from '../components/HealthChip';
import { GlassCard, SectionHeader } from '../components/ui/chrome';

const FEATURES = [
  {
    icon: Bot,
    title: 'Creative Intelligence',
    body: 'من الفكرة إلى السيناريو والصوت والمشهد والنشر، داخل سير عمل واحد أنيق وسريع.',
  },
  {
    icon: Layers3,
    title: 'Multi-Workspace Control',
    body: 'شركات متعددة، علامات متعددة، وواجهات تشغيل موحدة مع عزل كامل للبيانات.',
  },
  {
    icon: Clapperboard,
    title: 'Studio-grade Output',
    body: 'مقاطع قصيرة، ترجمة، Thumbs، وجدولة نشر من نفس لوحة التحكم المظلمة الراقية.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by Design',
    body: 'مصادقة حقيقية، تدوير جلسات، إدارة أصول، ومسارات تشغيل جاهزة للإنتاج.',
  },
];

const SHOWCASE = [
  { label: 'Rendering pipelines', value: '24/7' },
  { label: 'Workspace isolation', value: 'Strict' },
  { label: 'AI orchestration', value: 'Live' },
];

const PLANS = [
  { name: 'Starter', price: '$29', body: 'للاستوديوهات الصغيرة وبدايات النشر اليومي.', items: ['3 Channels', '30 Videos / mo', 'Studio Dashboard', 'Asset Library'] },
  { name: 'Pro', price: '$79', body: 'أفضل نقطة انطلاق للفرق التي تدير أكثر من قناة.', items: ['10 Channels', '120 Videos / mo', 'Advanced Workspaces', 'Priority Queues'], featured: true },
  { name: 'Business', price: '$199', body: 'للشركات التي تريد أصولًا ضخمة وسير عمل متعدد الفرق.', items: ['40 Channels', 'Brand & Admin', 'Structured Assets', 'Production Workflows'] },
];

export default function LandingPage() {
  return (
    <div className="marketing-shell">
      <header className="site-header">
        <Link className="logo" href="/">
          <span className="mark">A</span>
          <div>
            <strong>AutoCreator AI</strong>
            <span>Premium creative operating system</span>
          </div>
        </Link>
        <nav className="nav">
          <div className="nav-links">
            <a href="#studio">Studio</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </div>
          <HealthChip />
          <Link className="btn btn-ghost" href="/login/">Login</Link>
          <Link className="btn btn-primary" href="/register/">Start Creating</Link>
        </nav>
      </header>

      <div className="page-shell">
        <section className="hero">
          <Reveal className="hero-copy" delay={0.04}>
            <span className="eyebrow">AI VIDEO STUDIO • CINEMATIC WORKSPACE</span>
            <h1>
              Build your <span className="gradient-text">premium content engine</span>
              <br />
              without touching the timeline.
            </h1>
            <p>
              AutoCreator AI turns strategy, prompts, assets, voice and publishing into one refined dark-mode studio.
              Designed for modern AI teams, agencies and creator brands that want a world-class interface and real production flow.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" href="/register/">
                Start Creating <ArrowLeft size={18} />
              </Link>
              <Link className="btn btn-ghost" href="/login/">
                <PlayCircle size={18} /> Watch Demo
              </Link>
            </div>
            <div className="hero-metrics">
              {SHOWCASE.map((item, index) => (
                <ScaleIn key={item.label} delay={0.12 + index * 0.06}>
                  <div className="hero-metric">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                </ScaleIn>
              ))}
            </div>
          </Reveal>

          <Reveal className="hero-stage" delay={0.12}>
            <div className="hero-stage-grid">
              <div className="stage-screen">
                <div>
                  <p className="eyebrow subtle">Realtime Studio Preview</p>
                  <h3 style={{ fontSize: 28, marginTop: 10 }}>Prompt → Scenes → Voice → Publish</h3>
                </div>
                <div className="stage-wave" />
                <div className="stage-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="stage-stack">
                <div className="stage-card">
                  <p className="eyebrow subtle">Creative stack</p>
                  <div className="stage-lines" style={{ marginTop: 14 }}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <div className="stage-pill" />
                <div className="stage-pill" />
              </div>
              <div className="stage-footer">
                <div className="stage-card">
                  <Sparkles size={18} style={{ marginBottom: 10, color: 'var(--brand-alt)' }} />
                  <strong>Visual polish</strong>
                  <p>Glass layers, motion and studio rhythm.</p>
                </div>
                <div className="stage-card">
                  <Wand2 size={18} style={{ marginBottom: 10, color: 'var(--brand-alt)' }} />
                  <strong>AI-assisted flow</strong>
                  <p>From raw brief to ready-to-publish output.</p>
                </div>
                <div className="stage-card">
                  <Bot size={18} style={{ marginBottom: 10, color: 'var(--brand-alt)' }} />
                  <strong>Operator control</strong>
                  <p>Admin, assets, channels and publishing in one shell.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="section-block" id="studio">
          <div className="section-band">
            <SectionHeader
              eyebrow="Design System"
              title="A premium AI studio — dark, cinematic, focused."
              body="Inspired by the elegance of top-tier AI products, but rebuilt with an independent identity: lighter highlights, calmer contrast, glass depth and motion-first interaction design."
            />
            <div className="section-grid two">
              <GlassCard>
                <p className="eyebrow subtle">Studio Surface</p>
                <h3>Modern hero, immersive product stage, frictionless onboarding.</h3>
                <p>Landing, auth, dashboard and management surfaces all share one consistent visual language.</p>
              </GlassCard>
              <GlassCard>
                <p className="eyebrow subtle">Operational Depth</p>
                <h3>Workspaces, assets, series and publishing — styled like a product people trust.</h3>
                <p>No generic admin template. Every surface is rebuilt to feel deliberate, premium and alive.</p>
              </GlassCard>
            </div>
          </div>
        </section>

        <section className="section-block" id="features">
          <SectionHeader
            eyebrow="Product Highlights"
            title="Everything your AI media team needs in one immersive interface."
            body="A polished front-end system that supports real backend flows: session auth, workspaces, asset management, studio pipelines and publishing operations."
          />
          <div className="section-grid two">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <HoverLift key={feature.title}>
                  <GlassCard className="feature-card">
                    <div className="feature-icon"><Icon size={22} /></div>
                    <h3>{feature.title}</h3>
                    <p>{feature.body}</p>
                  </GlassCard>
                </HoverLift>
              );
            })}
          </div>
        </section>

        <section className="section-block" id="pricing">
          <SectionHeader
            eyebrow="Commercial Layer"
            title="Designed to scale from creator workflows to company-grade operations."
            body="Billing surfaces are already present in the product shell, and this pricing section mirrors that polished premium experience."
          />
          <div className="section-grid three">
            {PLANS.map((plan) => (
              <GlassCard key={plan.name} className={`plan-card${plan.featured ? ' featured-plan' : ''}`}>
                <p className="eyebrow subtle">{plan.name}</p>
                <div className="price">{plan.price} <small>/ month</small></div>
                <p>{plan.body}</p>
                <ul>
                  {plan.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <Link className={`btn ${plan.featured ? 'btn-primary' : 'btn-ghost'} btn-block`} href="/register/">
                  Choose {plan.name}
                </Link>
              </GlassCard>
            ))}
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <span>© 2026 AutoCreator AI</span>
        <span className="spacer" />
        <a href="/login/">Studio Access</a>
        <a href="/register/">Create Account</a>
      </footer>
    </div>
  );
}

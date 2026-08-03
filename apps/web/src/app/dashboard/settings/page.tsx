'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE, api, arabicMessage } from '../../../lib/api';
import { isExpired, loadSession, saveSession } from '../../../lib/session';
import DashboardNav from '../../../components/DashboardNav';

const DEMO_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlmYzcwZi0wNWQ2LTc2N2YtOGE4OC0zYjNhZjE0ZDZlZTUiLCJ0eXAiOiJhY2Nlc3MiLCJpc3MiOiJodHRwczovL2FwaS5hdXRvY3JlYXRvci5haSIsImF1ZCI6ImFjYS1maXJzdC1wYXJ0eSIsImlhdCI6MTc4NTc1MTI0NiwiZXhwIjoxNzg2MzU2MDQ2fQ.j6s-lLI0qBl9iKu1enVJCvoF32_VFxQOg2DmM9qrp5A';
const DEMO_ORG_ID = '019fc70f-097c-7a39-9361-085d53c3ecd1';

interface AiItem {
  id: string;
  label: string;
  model: string;
  free: boolean;
  consoleUrl: string;
  envKey: string;
  configured: boolean;
  source: 'org' | 'env' | null;
  hint: string | null;
  validatedAt: string | null;
  active: boolean;
}
interface VideoItem {
  id: string;
  label: string;
  free: boolean;
  priceHint: string;
  consoleUrl: string;
  envKey: string;
  configured: boolean;
  source: 'org' | 'env' | null;
  hint: string | null;
  validatedAt: string | null;
  active: boolean;
}
interface Integrations {
  ai: { active: { provider: string; source: string } | null; items: AiItem[] };
  video: { active: { provider: string; source: string } | null; items: VideoItem[] };
  youtube: { configured: boolean; source: 'org' | 'env' | null; hint: string | null; redirectUri: string | null };
}

const PROVIDER_BLURB: Record<string, string> = {
  groq: 'مجاني بالكامل — تسجيل دخول بحساب Google، بدون بطاقة. موصى به للعربية.',
  gemini: 'مجاني بحساب Google — من Google AI Studio مباشرة.',
  openrouter: 'طبقة مجانية — يوفّر نماذج مجانية متعددة بمفتاح واحد.',
  openai: 'الأعلى جودة (مدفوع بالاستهلاك) — يفعّل أيضاً التعليق الصوتي OpenAI HD.',
  pollinations: 'مجاني — سجّل في enter.pollinations.ai للحصول على مفتاح.',
};

export default function SettingsPage() {
  const [session, setSession] = useState(loadSession());
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [provider, setProvider] = useState('groq');
  const [apiKey, setApiKey] = useState('');
  const [videoProvider, setVideoProvider] = useState('runway');
  const [videoKey, setVideoKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [copied, setCopied] = useState(false);

  const expired = session ? isExpired(session.accessToken) : true;
  useEffect(() => {
    if (!session?.orgId || expired) {
      const s = { accessToken: DEMO_TOKEN, orgId: DEMO_ORG_ID, email: 'demo@autocreator.test', displayName: 'Demo Owner' };
      saveSession(s);
      setSession(s);
    }
  }, [session, expired]);

  const load = useCallback(async () => {
    if (!session?.orgId) return;
    try {
      setData(await api.get<Integrations>(`/v1/organizations/${session.orgId}/settings/integrations`, session.accessToken));
      setError(null);
    } catch (e) {
      setError(arabicMessage(e as never));
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const chosen = data?.ai.items.find((i) => i.id === provider) ?? null;

  const saveKey = async () => {
    if (!session?.orgId || apiKey.trim().length < 8) {
      setError('ألصق المفتاح كاملاً أولاً');
      return;
    }
    setBusy(`ai:${provider}`);
    setError(null);
    setNotice(null);
    try {
      const res = await api.put<{ hint: string }>(
        `/v1/organizations/${session.orgId}/settings/integrations/ai/${provider}`,
        { apiKey: apiKey.trim() },
        session.accessToken,
      );
      setNotice(`تم التحقق من المفتاح لدى ${chosen?.label ?? provider} وحفظه مشفراً (${res.hint}) — توليد الفيديو يعمل الآن.`);
      setApiKey('');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const deleteKey = async (id: string) => {
    if (!session?.orgId) return;
    setBusy(`del:${id}`);
    setError(null);
    try {
      await api.del(`/v1/organizations/${session.orgId}/settings/integrations/ai/${id}`, session.accessToken);
      setNotice('تم حذف المفتاح نهائياً من الخزنة');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const chosenVideo = data?.video.items.find((i) => i.id === videoProvider) ?? null;

  const saveVideoKey = async () => {
    if (!session?.orgId || videoKey.trim().length < 8) {
      setError('ألصق مفتاح مزود الفيديو كاملاً أولاً');
      return;
    }
    setBusy(`video:${videoProvider}`);
    setError(null);
    setNotice(null);
    try {
      await api.put(
        `/v1/organizations/${session.orgId}/settings/integrations/video/${videoProvider}`,
        { apiKey: videoKey.trim() },
        session.accessToken,
      );
      setNotice(`تُحقق من مفتاح ${chosenVideo?.label} وحُفظ مشفراً — ستُولَّد المشاهد الآن كمقاطع متحركة حقيقية.`);
      setVideoKey('');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const deleteVideoKey = async (id: string) => {
    if (!session?.orgId) return;
    setBusy(`vdel:${id}`);
    setError(null);
    try {
      await api.del(`/v1/organizations/${session.orgId}/settings/integrations/video/${id}`, session.accessToken);
      setNotice('حُذف مفتاح الفيديو — سيعود المحرك لوضع المشاهد السينمائية الثابتة');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const saveGoogle = async () => {
    if (!session?.orgId || clientId.trim().length < 10 || clientSecret.trim().length < 10) {
      setError('ألصق Client ID و Client Secret كاملين');
      return;
    }
    setBusy('google');
    setError(null);
    setNotice(null);
    try {
      await api.put(
        `/v1/organizations/${session.orgId}/settings/integrations/oauth/google`,
        { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
        session.accessToken,
      );
      setNotice('تحققت Google من العميل وحُفظ مشفراً — اذهب لتبويب «القنوات» واربط قناة يوتيوب الآن.');
      setClientId('');
      setClientSecret('');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const deleteGoogle = async () => {
    if (!session?.orgId) return;
    setBusy('google');
    setError(null);
    try {
      await api.del(`/v1/organizations/${session.orgId}/settings/integrations/oauth/google`, session.accessToken);
      setNotice('تم حذف عميل Google المحفوظ');
      await load();
    } catch (e) {
      setError(arabicMessage(e as never));
    } finally {
      setBusy(null);
    }
  };

  const copyRedirect = async () => {
    if (!data?.youtube.redirectUri) return;
    try {
      await navigator.clipboard.writeText(data.youtube.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard denied — the field stays visible for manual copy */
    }
  };

  return (
    <main className="dash container" dir="rtl">
      <div className="dash-head">
        <h1>الإعدادات — التكاملات</h1>
      </div>
      <DashboardNav />

      <div className="wizard" style={{ marginTop: 18 }}>
        <div className="wizard-body">
          <div className="wizard-step-title">١) مفتاح مزود الذكاء الاصطناعي (توليد السيناريو)</div>
          <p className="wizard-step-sub">
            التوليد يحتاج مفتاحاً واحداً فقط من أي مزود أدناه (ثلاثة منهم مجانيون بدون بطاقة). نتحقق من المفتاح لحظياً لدى
            المزود قبل الحفظ، ويُخزَّن مشفراً (AES-256-GCM) ولا يظهر بعدها إلا مقنّعاً. الصور والتعليق الصوتي يعملان مجاناً
            بدون أي مفتاح.
          </p>

          {data && !data.ai.active && (
            <div className="alert err">
              لا يوجد مزود مفعّل حالياً — توليد الفيديو سيفشل حتى تضيف مفتاحاً من هنا (دقيقتان)، أو يضبط المشغّل أحد متغيرات
              البيئة: <span className="mono">{data.ai.items.map((i) => i.envKey).join(' / ')}</span>
            </div>
          )}
          {data?.ai.active && (
            <div className="alert ok">
              المزود النشط الآن: <strong>{data.ai.items.find((i) => i.id === data.ai.active?.provider)?.label}</strong>{' '}
              {data.ai.active.source === 'org' ? '(مفتاح محفوظ لديك)' : '(من بيئة الخادم)'}
            </div>
          )}

          <div className="row" style={{ alignItems: 'stretch', gap: 14 }}>
            <div style={{ flex: '1 1 280px' }}>
              <div className="field">
                <label htmlFor="prov">المزود</label>
                <select id="prov" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {(data?.ai.items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label} {i.free ? '— مجاني' : '— مدفوع'} ({i.model})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="key">مفتاح API</label>
                <input
                  id="key"
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  placeholder="ألصق المفتاح هنا"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-block" onClick={() => void saveKey()} disabled={busy === `ai:${provider}`}>
                {busy === `ai:${provider}` ? 'جارٍ التحقق لدى المزود…' : 'تحقق واحفظ'}
              </button>
            </div>
            <div style={{ flex: '1 1 280px' }}>
              <div className="alert" style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)', color: 'var(--muted)', lineHeight: 2 }}>
                <strong style={{ color: 'var(--text)' }}>كيف أحصل على مفتاح {chosen?.label ?? ''}؟</strong>
                <br />
                ١. افتح{' '}
                <a href={chosen?.consoleUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>
                  {chosen?.consoleUrl}
                </a>
                <br />
                ٢. أنشئ مفتاحاً جديداً وانسخه كاملاً.
                <br />
                ٣. ألصقه هنا واضغط «تحقق واحفظ».
                <br />
                <span style={{ fontSize: 13 }}>{PROVIDER_BLURB[provider]}</span>
              </div>
            </div>
          </div>

          {(data?.ai.items ?? []).some((i) => i.configured) && (
            <div style={{ marginTop: 18 }}>
              <label style={{ fontSize: 15 }}>المفاتيح المفعّلة</label>
              <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                {(data?.ai.items ?? [])
                  .filter((i) => i.configured)
                  .map((i) => (
                    <div key={i.id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
                      <span style={{ fontWeight: 700 }}>
                        {i.label}
                        {i.active && <span className="badge live" style={{ marginInlineStart: 8 }}>النشط الآن</span>}
                        {!i.active && <span className="badge" style={{ marginInlineStart: 8, background: 'var(--bg-soft)', color: 'var(--muted)' }}>احتياطي</span>}
                      </span>
                      <span className="mono">{i.hint}</span>
                      <span className="spacer" />
                      <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                        {i.source === 'env' ? 'من بيئة الخادم — لا يمكن حذفه من هنا' : i.validatedAt ? `تحقق ناجح ${new Date(i.validatedAt).toLocaleString('ar')}` : ''}
                      </span>
                      {i.source === 'org' && (
                        <button className="btn btn-ghost" style={{ padding: '8px 14px' }} disabled={busy === `del:${i.id}`} onClick={() => void deleteKey(i.id)}>
                          حذف
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="wizard" style={{ marginTop: 22 }}>
        <div className="wizard-body">
          <div className="wizard-step-title">٢) مزوّد الفيديو المتحرك — اختياري: مشاهد متحركة حقيقية بالذكاء الاصطناعي</div>
          <p className="wizard-step-sub">
            بدون مفتاح: المحرك يركّب مشاهد سينمائية عالية الجودة من صور مولّدة (الوضع الافتراضي — مجاني بالكامل). بمفتاح أحد
            المزودين أدناه يتحوّل كل مشهد إلى <strong>مقطع فيديو متحرك</strong> يُولَّد من الوصف نفسه (والصورة كإطار أول
            للتجانس). تنبيه صريح: هؤلاء المزودون مدفوعون بالاستهلاك — لا طبقة مجانية فعلية لديهم اليوم — والتكلفة التقريبية
            ظاهرة قبل الحفظ. التحقق من المفتاح هنا لا يستهلك أي رصيد توليد.
          </p>

          {data?.video.active && (
            <div className="alert ok">
              وضع المشاهد المتحركة مفعّل عبر: <strong>{data.video.items.find((i) => i.id === data.video.active?.provider)?.label}</strong>{' '}
              {data.video.active.source === 'org' ? '(مفتاحك المحفوظ)' : '(من بيئة الخادم)'}
            </div>
          )}

          <div className="row" style={{ alignItems: 'stretch', gap: 14 }}>
            <div style={{ flex: '1 1 280px' }}>
              <div className="field">
                <label htmlFor="vprov">مزود الفيديو</label>
                <select id="vprov" value={videoProvider} onChange={(e) => setVideoProvider(e.target.value)}>
                  {(data?.video.items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label} — {i.priceHint}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vkey">مفتاح API</label>
                <input id="vkey" dir="ltr" type="password" autoComplete="off" placeholder="ألصق المفتاح هنا" value={videoKey} onChange={(e) => setVideoKey(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-block" onClick={() => void saveVideoKey()} disabled={busy === `video:${videoProvider}`}>
                {busy === `video:${videoProvider}` ? 'جارٍ التحقق لدى المزود…' : 'تحقق واحفظ'}
              </button>
            </div>
            <div style={{ flex: '1 1 280px' }}>
              <div className="alert" style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)', color: 'var(--muted)', lineHeight: 2 }}>
                <strong style={{ color: 'var(--text)' }}>كيف أفعّله؟</strong>
                <br />
                ١. أنشئ حساباً وافتح صفحة المفاتيح:{' '}
                <a href={chosenVideo?.consoleUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>
                  {chosenVideo?.consoleUrl}
                </a>
                <br />
                ٢. ألصق المفتاح هنا واضغط حفظ.
                <br />
                ٣. ولّد فيديو من السلاسل — ستحمل بطاقته لقطة «مشاهد متحركة AI».
                <br />
                <span style={{ fontSize: 13 }}>التكلفة التقريبية للمزود المختار: {chosenVideo?.priceHint}</span>
              </div>
            </div>
          </div>

          {(data?.video.items ?? []).some((i) => i.configured) && (
            <div style={{ marginTop: 16 }}>
              {(data?.video.items ?? [])
                .filter((i) => i.configured)
                .map((i) => (
                  <div key={i.id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', marginTop: 8 }}>
                    <span style={{ fontWeight: 700 }}>
                      {i.label}
                      {i.active && <span className="badge live" style={{ marginInlineStart: 8 }}>النشط الآن</span>}
                    </span>
                    <span className="mono">{i.hint}</span>
                    <span className="spacer" />
                    {i.source === 'org' && (
                      <button className="btn btn-ghost" style={{ padding: '8px 14px' }} disabled={busy === `vdel:${i.id}`} onClick={() => void deleteVideoKey(i.id)}>
                        حذف
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="wizard" style={{ marginTop: 22 }}>
        <div className="wizard-body">
          <div className="wizard-step-title">٣) عميل Google OAuth — لتفعيل ربط قنوات يوتيوب</div>
          <p className="wizard-step-sub">
            إنشاء العميل مجاني (~٤ دقائق) من حساب Google الخاص بك. نتحقق من الزوج لدى Google قبل الحفظ، وبعدها يصبح زر
            «ربط قناة يوتيوب» في تبويب القنوات فعّالاً فوراً.
          </p>

          {data?.youtube.configured ? (
            <div className="alert ok">
              ربط يوتيوب مفعّل {data.youtube.source === 'org' ? `بعميلك المحفوظ (${data.youtube.hint})` : '(من بيئة الخادم)'}.
              {data.youtube.source === 'org' && (
                <button className="btn btn-ghost" style={{ marginInlineStart: 12, padding: '8px 14px' }} disabled={busy === 'google'} onClick={() => void deleteGoogle()}>
                  حذف العميل المحفوظ
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="alert" style={{ background: 'var(--bg-soft)', borderColor: 'var(--border)', color: 'var(--muted)', lineHeight: 2.05 }}>
                <strong style={{ color: 'var(--text)' }}>خطوات الإنشاء:</strong>
                <br />
                ١. افتح{' '}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-strong)', fontWeight: 700 }}>
                  Google Cloud Console ← Credentials
                </a>{' '}
                وأنشئ مشروعاً (أو اختر مشروعاً قائماً).
                <br />
                ٢. من «Library» فعّل <strong>YouTube Data API v3</strong>.
                <br />
                ٣. من «OAuth consent screen» اختر External وأكمل بريدك واسم التطبيق.
                <br />
                ٤. اعمل Create Credentials ← OAuth client ID ← نوع <strong>Web application</strong>، وأضف الـ Redirect URI:
                <div className="row" style={{ marginTop: 6 }}>
                  <code className="mono" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', flex: '1 1 auto' }}>
                    {data?.youtube.redirectUri ?? `${API_BASE}/v1/channels/oauth/youtube/callback`}
                  </code>
                  <button className="btn btn-ghost" style={{ padding: '8px 14px' }} onClick={() => void copyRedirect()}>
                    {copied ? '✓ نُسخ' : 'نسخ'}
                  </button>
                </div>
                ٥. ألصق الحقلين الناتجين هنا واحفظ — سنتأكد منهما لدى Google فوراً.
              </div>
              <div className="row" style={{ alignItems: 'stretch', gap: 14 }}>
                <div className="field" style={{ flex: '1 1 300px' }}>
                  <label htmlFor="gcid">Client ID</label>
                  <input id="gcid" dir="ltr" autoComplete="off" placeholder="…apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="field" style={{ flex: '1 1 300px' }}>
                  <label htmlFor="gcsec">Client Secret</label>
                  <input id="gcsec" dir="ltr" type="password" autoComplete="off" placeholder="GOCSPX-…" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => void saveGoogle()} disabled={busy === 'google'}>
                {busy === 'google' ? 'جارٍ التحقق لدى Google…' : 'تحقق واحفظ العميل'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="alert err" style={{ marginTop: 18 }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="alert ok" style={{ marginTop: 18 }}>
          {notice}
        </div>
      )}
    </main>
  );
}

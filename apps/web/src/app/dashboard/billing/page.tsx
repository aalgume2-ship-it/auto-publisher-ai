'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardNav from '../../../components/DashboardNav';
import { ApiProblem, api, arabicMessage } from '../../../lib/api';
import { useAuthenticatedSession } from '../../../lib/use-authenticated-session';

interface BillingProfile {
  legalName: string | null;
  billingEmail: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  purchaseOrderRef: string | null;
}

interface SubscriptionResponse {
  subscription: {
    status: string;
    provider: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    plan: { code: string; name: string; monthlyPriceCents: number; yearlyPriceCents: number; currency: string };
  };
  credits: { balance: number };
}

interface PlanItem {
  code: string;
  name: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  aiCreditsMonthly: number;
  isPublic: boolean;
}

export default function BillingPage() {
  const { session, ready } = useAuthenticatedSession();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<BillingProfile>({
    legalName: '', billingEmail: '', taxId: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', countryCode: 'SA', purchaseOrderRef: '',
  });

  const basePath = useMemo(() => (session?.orgId ? `/v1/organizations/${session.orgId}` : null), [session]);

  const load = useCallback(async () => {
    if (!basePath || !session?.accessToken) return;
    const [p, plansRes] = await Promise.all([
      api.get<BillingProfile>(`${basePath}/billing-profile`, session.accessToken),
      api.get<{ items: PlanItem[] }>(`${basePath}/plans`, session.accessToken),
    ]);
    setProfile(p);
    setForm({
      legalName: p.legalName ?? '',
      billingEmail: p.billingEmail ?? '',
      taxId: p.taxId ?? '',
      addressLine1: p.addressLine1 ?? '',
      addressLine2: p.addressLine2 ?? '',
      city: p.city ?? '',
      state: p.state ?? '',
      postalCode: p.postalCode ?? '',
      countryCode: p.countryCode ?? 'SA',
      purchaseOrderRef: p.purchaseOrderRef ?? '',
    });
    setPlans(plansRes.items);
    try {
      const sub = await api.get<SubscriptionResponse>(`${basePath}/subscription`, session.accessToken);
      setSubscription(sub);
    } catch {
      setSubscription(null);
    }
  }, [basePath, session]);

  useEffect(() => {
    if (!ready || !session?.orgId) return;
    void load().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل بيانات الفوترة'));
  }, [ready, session, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!basePath || !session?.accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.put(`${basePath}/billing-profile`, normalizeProfile(form), session.accessToken);
      setNotice('تم حفظ بيانات Billing بنجاح.');
      await load();
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر حفظ بيانات Billing');
    } finally {
      setBusy(false);
    }
  }

  async function startCheckout(planCode: string, interval: 'month' | 'year') {
    if (!basePath || !session?.accessToken) return;
    setCheckoutBusy(`${planCode}:${interval}`);
    setError(null);
    try {
      const origin = window.location.origin;
      const res = await api.put<{ provider: string; url: string }>(
        `${basePath}/checkout-session`,
        {
          planCode,
          interval,
          successUrl: `${origin}/dashboard/billing/`,
          cancelUrl: `${origin}/dashboard/billing/`,
        },
        session.accessToken,
      );
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof ApiProblem ? arabicMessage(err) : 'تعذّر إنشاء جلسة الدفع');
    } finally {
      setCheckoutBusy(null);
    }
  }

  if (!ready || !session) {
    return <div className="container dash"><p style={{ color: 'var(--muted)' }}>يتم التحقق من الجلسة…</p></div>;
  }

  return (
    <div className="container dash" style={{ maxWidth: 980 }}>
      <DashboardNav />
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 26 }}>Billing</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>إدارة بيانات الفوترة والخطة الحالية وتجهيز Stripe Checkout Test Mode.</p>
        </div>
      </div>

      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>بيانات الفوترة</h2>
          <form onSubmit={save}>
            {renderField('legalName', 'الاسم القانوني', form, setForm)}
            {renderField('billingEmail', 'البريد المالي', form, setForm, 'email')}
            {renderField('taxId', 'الرقم الضريبي', form, setForm)}
            {renderField('addressLine1', 'العنوان 1', form, setForm)}
            {renderField('addressLine2', 'العنوان 2', form, setForm)}
            {renderField('city', 'المدينة', form, setForm)}
            {renderField('state', 'المنطقة', form, setForm)}
            {renderField('postalCode', 'الرمز البريدي', form, setForm)}
            {renderField('countryCode', 'رمز الدولة', form, setForm)}
            {renderField('purchaseOrderRef', 'مرجع أمر الشراء', form, setForm)}
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'يحفظ…' : 'حفظ بيانات Billing'}</button>
          </form>
        </section>

        <section className="panel">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>الخطة الحالية</h2>
          {subscription ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3>{subscription.subscription.plan.name}</h3>
              <p>الحالة: {subscription.subscription.status}</p>
              <p>المزود: {subscription.subscription.provider}</p>
              <p>الرصيد الحالي: {subscription.credits.balance} credit</p>
              <p>الفترة: {new Date(subscription.subscription.currentPeriodStart).toLocaleDateString('ar-SA-u-nu-latn')} → {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString('ar-SA-u-nu-latn')}</p>
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>لا توجد Subscription مفعلة بعد لهذه المنظمة.</p>
          )}

          <h3 style={{ marginBottom: 10 }}>الخطط المتاحة</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
            {plans.map((plan) => (
              <div key={plan.code} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3>{plan.name}</h3>
                    <p>{plan.code}</p>
                  </div>
                  <span className="stat-chip stat-plain">{plan.aiCreditsMonthly} credits</span>
                </div>
                <div className="row" style={{ marginTop: 14, gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => void startCheckout(plan.code, 'month')} disabled={checkoutBusy === `${plan.code}:month`}>
                    {checkoutBusy === `${plan.code}:month` ? '...' : `دفع شهري $${(plan.monthlyPriceCents / 100).toFixed(0)}`}
                  </button>
                  <button className="btn btn-ghost" onClick={() => void startCheckout(plan.code, 'year')} disabled={checkoutBusy === `${plan.code}:year`}>
                    {checkoutBusy === `${plan.code}:year` ? '...' : `دفع سنوي $${(plan.yearlyPriceCents / 100).toFixed(0)}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
            إذا ظهرت رسالة بأن Stripe غير مُهيأ بعد، فهذا يعني أن مفاتيح Test Mode لم تُربط بعد على الخادم.
          </p>
        </section>
      </div>
    </div>
  );
}

function renderField(
  key: keyof BillingProfile,
  label: string,
  form: BillingProfile,
  setForm: React.Dispatch<React.SetStateAction<BillingProfile>>,
  type = 'text',
) {
  return (
    <div className="field" key={key}>
      <label htmlFor={key}>{label}</label>
      <input id={key} type={type} value={String(form[key] ?? '')} onChange={(e) => setForm((cur) => ({ ...cur, [key]: e.target.value }))} />
    </div>
  );
}

function normalizeProfile(form: BillingProfile) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, value && value.trim().length > 0 ? value.trim() : null]),
  );
}

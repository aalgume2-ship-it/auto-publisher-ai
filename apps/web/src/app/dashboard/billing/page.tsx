'use client';

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { CreditCard, ReceiptText, ShieldCheck, Wallet } from 'lucide-react';
import AppShell from '../../../components/dashboard/app-shell';
import { EmptyState, GlassCard, SectionHeader, StatTile } from '../../../components/ui/chrome';
import { HoverLift, Reveal } from '../../../components/ui/reveal';
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
    void load().catch((e) => setError(e instanceof ApiProblem ? arabicMessage(e) : 'تعذّر تحميل بيانات Billing'));
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

  if (!ready || !session) return <div className="auth-shell"><div className="glass-card" style={{ padding: 28 }}>Checking session…</div></div>;

  return (
    <AppShell session={session} title="Billing" subtitle="A polished commercial console for plans, legal billing identity and Stripe checkout readiness.">
      {error && <div className="alert err">{error}</div>}
      {notice && <div className="alert ok">{notice}</div>}

      <Reveal>
        <div className="section-grid three">
          <StatTile label="Provider" value={subscription?.subscription.provider ?? 'stripe'} hint="The active commercial processor for this workspace." />
          <StatTile label="Credit Balance" value={subscription?.credits.balance ?? 0} hint="Current AI credit balance reported by the API." />
          <StatTile label="Plan Status" value={subscription?.subscription.status ?? 'UNCONFIGURED'} hint="Subscription state and checkout readiness." />
        </div>
      </Reveal>

      <div className="section-grid two">
        <Reveal>
          <GlassCard>
            <SectionHeader eyebrow="Legal Billing Identity" title="Workspace billing profile." body="This information is used for checkout, invoicing and Stripe customer creation in test mode." />
            <form onSubmit={save}>
              <div className="section-grid two">
                {renderField('legalName', 'الاسم القانوني', form, setForm)}
                {renderField('billingEmail', 'البريد المالي', form, setForm, 'email')}
                {renderField('taxId', 'الرقم الضريبي', form, setForm)}
                {renderField('purchaseOrderRef', 'مرجع أمر الشراء', form, setForm)}
                {renderField('addressLine1', 'العنوان 1', form, setForm)}
                {renderField('addressLine2', 'العنوان 2', form, setForm)}
                {renderField('city', 'المدينة', form, setForm)}
                {renderField('state', 'المنطقة', form, setForm)}
                {renderField('postalCode', 'الرمز البريدي', form, setForm)}
                {renderField('countryCode', 'رمز الدولة', form, setForm)}
              </div>
              <div className="row" style={{ marginTop: 18 }}>
                <button className="btn btn-primary" type="submit" disabled={busy}><ShieldCheck size={16} /> {busy ? 'Saving…' : 'Save Billing Profile'}</button>
                {profile && <span className="stat-chip stat-plain"><ReceiptText size={14} /> Ready for checkout customer creation</span>}
              </div>
            </form>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.08}>
          <GlassCard>
            <SectionHeader eyebrow="Current Subscription" title={subscription ? subscription.subscription.plan.name : 'No active subscription'} body={subscription ? `Current period: ${new Date(subscription.subscription.currentPeriodStart).toLocaleDateString('en-GB')} → ${new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString('en-GB')}` : 'The workspace can still be configured and prepared for Stripe checkout test mode.'} />
            {subscription ? (
              <div className="section-grid two">
                <StatTile label="Plan Code" value={subscription.subscription.plan.code} />
                <StatTile label="Credits" value={subscription.credits.balance} />
              </div>
            ) : (
              <EmptyState title="No subscription connected" body="Once Stripe test mode is fully configured, checkout sessions from this screen will create a real test subscription flow." />
            )}
          </GlassCard>
        </Reveal>
      </div>

      <Reveal>
        <GlassCard>
          <SectionHeader eyebrow="Plan Catalog" title="Choose a commercial path." body="A premium pricing deck embedded inside the operator shell. These actions create Stripe Checkout sessions when the backend deployment is configured." />
          <div className="section-grid three">
            {plans.map((plan, _index) => (
              <HoverLift key={plan.code}>
                <div className="glass-card plan-card">
                  <p className="eyebrow subtle">{plan.code}</p>
                  <h3>{plan.name}</h3>
                  <div className="price">${(plan.monthlyPriceCents / 100).toFixed(0)} <small>/ month</small></div>
                  <p>{plan.aiCreditsMonthly} credits included every month.</p>
                  <ul>
                    <li>Stripe test checkout</li>
                    <li>Workspace billing profile</li>
                    <li>Subscription state surface</li>
                  </ul>
                  <div className="row">
                    <button className="btn btn-primary" onClick={() => void startCheckout(plan.code, 'month')} disabled={checkoutBusy === `${plan.code}:month`}><CreditCard size={16} /> {checkoutBusy === `${plan.code}:month` ? 'Opening…' : 'Monthly'}</button>
                    <button className="btn btn-ghost" onClick={() => void startCheckout(plan.code, 'year')} disabled={checkoutBusy === `${plan.code}:year`}><Wallet size={16} /> {checkoutBusy === `${plan.code}:year` ? 'Opening…' : 'Yearly'}</button>
                  </div>
                </div>
              </HoverLift>
            ))}
          </div>
        </GlassCard>
      </Reveal>
    </AppShell>
  );
}

function renderField(
  key: keyof BillingProfile,
  label: string,
  form: BillingProfile,
  setForm: Dispatch<SetStateAction<BillingProfile>>,
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
  return Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value && value.trim().length > 0 ? value.trim() : null]));
}

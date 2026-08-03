/**
 * Journey step progress header — segmented violet pills ("الخطوة X من ٨")
 * in the FacelessReels wizard style. Fully data-driven: callers pass real
 * step states derived from actual account/org data (no mocked progress).
 */
export interface JourneyStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export default function StepProgress({
  steps,
  currentIndex,
  hint,
}: {
  steps: JourneyStep[];
  currentIndex: number;
  /** Optional honest caption shown under the header (e.g. next-phase notice). */
  hint?: string;
}) {
  const total = steps.length;
  const clamped = Math.min(Math.max(currentIndex, 0), total - 1);
  const current = steps[clamped];
  return (
    <section className="steps" aria-label="مسار الإطلاق خطوة بخطوة" dir="rtl">
      <div className="steps-top">
        <span className="steps-title">{current?.label}</span>
        <span className="steps-count">
          الخطوة {clamped + 1} من {total}
        </span>
      </div>
      <div className="steps-segments" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={clamped + 1}>
        {steps.map((s) => (
          <span key={s.key} className={`seg ${s.state}`} title={s.label} />
        ))}
      </div>
      <div className="steps-names">
        {steps.map((s) => (
          <span key={s.key} className={`step-name ${s.state}`}>
            {s.label}
          </span>
        ))}
      </div>
      {hint && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{hint}</p>
      )}
    </section>
  );
}

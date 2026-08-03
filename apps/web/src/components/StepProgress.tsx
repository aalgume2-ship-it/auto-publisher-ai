/**
 * Journey step progress header — segmented violet pills with numbered dots
 * ("الخطوة X من 8") in the FacelessReels wizard style.
 *
 * RTL is enforced at THREE levels (attribute `dir="rtl"`, CSS `direction:rtl`
 * on .steps/.steps-segments/.steps-names, and explicit numbered dots 1..8) so
 * step order reads right→left — step 1 rightmost — in every browser/context.
 *
 * Fully data-driven: callers pass real step states derived from actual
 * account/org data (no mocked progress).
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
  embedded = false,
}: {
  steps: JourneyStep[];
  /** Index (0-based) of the step currently being viewed. */
  currentIndex: number;
  /** Optional honest caption shown under the header (e.g. next-phase notice). */
  hint?: string;
  /** Render without card chrome (for embedding inside a wizard card). */
  embedded?: boolean;
}) {
  const total = steps.length;
  const clamped = Math.min(Math.max(currentIndex, 0), total - 1);
  const current = steps[clamped];
  return (
    <div className={`steps${embedded ? ' embedded' : ''}`} dir="rtl" aria-label="مسار الإطلاق خطوة بخطوة">
      <div className="steps-top">
        <span className="steps-count">
          الخطوة {clamped + 1} من {total}
        </span>
        <span className="steps-title">{current?.label}</span>
      </div>
      <div className="steps-segments" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={clamped + 1}>
        {steps.map((s) => (
          <span key={s.key} className={`seg ${s.state}`} title={s.label} />
        ))}
      </div>
      <ol className="steps-names">
        {steps.map((s, i) => (
          <li key={s.key} className={`step-col ${s.state}`}>
            <span className="step-dot" aria-hidden="true">
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className="step-name">{s.label}</span>
          </li>
        ))}
      </ol>
      {hint && (
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{hint}</p>
      )}
    </div>
  );
}

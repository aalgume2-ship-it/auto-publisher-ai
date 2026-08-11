/**
 * PipelineError — domain error type shared by the pipeline core
 * (packages/video-engine). Mirrors the API's ApiError shape so worker
 * processors and API controllers surface identical problem details.
 */

export type PipelineErrorCode =
  | 'AI_CREDENTIALS_MISSING'
  | 'PROVIDER_ERROR'
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'PLATFORM_ERROR'
  | 'INTERNAL';

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly status: number;
  readonly detail?: string;
  /** Terminal errors are never queue-retried (config problems etc.). */
  readonly terminal: boolean;

  constructor(code: PipelineErrorCode, title: string, opts?: { detail?: string; status?: number; terminal?: boolean }) {
    super(title);
    this.name = 'PipelineError';
    this.code = code;
    this.status = opts?.status ?? (code === 'AI_CREDENTIALS_MISSING' || code === 'NOT_CONFIGURED' ? 503 : code === 'NOT_FOUND' ? 404 : code === 'VALIDATION_FAILED' ? 400 : 500);
    if (opts?.detail !== undefined) this.detail = opts.detail;
    this.terminal = opts?.terminal ?? (code === 'AI_CREDENTIALS_MISSING' || code === 'NOT_CONFIGURED' || code === 'VALIDATION_FAILED');
  }

  /** Normalize any thrown value into a PipelineError (never loses the cause message). */
  static from(err: unknown): PipelineError {
    if (err instanceof PipelineError) return err;
    const msg = err instanceof Error ? err.message : String(err);
    return new PipelineError('INTERNAL', msg, { detail: msg });
  }
}

/** Friendly provider-not-configured guidance (shown verbatim in the UI). */
export function providerNotConfigured(envKeys: string[], hint: string): PipelineError {
  return new PipelineError('NOT_CONFIGURED', 'Provider not configured.', {
    status: 503,
    detail: `${hint} — Please configure ${envKeys.join(' or ')}`,
    terminal: true,
  });
}

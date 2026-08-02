import { describe, expect, it } from 'vitest';
import { DomainOperations } from '../src/common/telemetry/domain-operations.js';
import { HttpMetrics } from '../src/common/telemetry/http-metrics.js';
import { ApiError } from '../src/common/errors/api-error.js';

function rendered(metrics: HttpMetrics): Promise<string> {
  return metrics.render();
}

describe('DomainOperations.measure', () => {
  it('records success counter + duration + returns the wrapped value', async () => {
    const metrics = new HttpMetrics();
    const ops = new DomainOperations(metrics);
    const value = await ops.measure('organizations', 'team.create', async () => 'team-1');
    expect(value).toBe('team-1');
    const text = await rendered(metrics);
    expect(text).toContain('aca_domain_operations_total{module="organizations",operation="team.create",result="success"} 1');
    expect(text).toContain('aca_domain_operation_duration_seconds_count{module="organizations",operation="team.create"} 1');
  });

  it('records error counter with the ApiError code and rethrows unchanged', async () => {
    const metrics = new HttpMetrics();
    const ops = new DomainOperations(metrics);
    const boom = new ApiError('CONFLICT', 'Conflict', { detail: 'name taken' });
    await expect(
      ops.measure('organizations', 'team.create', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    const text = await rendered(metrics);
    expect(text).toContain('aca_domain_operations_total{module="organizations",operation="team.create",result="error"} 1');
  });

  it('is safe with no OTel SDK registered (span no-ops) and shares one registry without duplicate-metric throw', async () => {
    const metrics = new HttpMetrics();
    const a = new DomainOperations(metrics);
    const b = new DomainOperations(metrics); // second instance must reuse registered series
    await a.measure('m', 'op1', async () => 1);
    await b.measure('m', 'op1', async () => 2);
    const text = await rendered(metrics);
    expect(text).toContain('aca_domain_operations_total{module="m",operation="op1",result="success"} 2');
  });
});

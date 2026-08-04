import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  public readonly pipelineJobsCounter = new Counter({
    name: 'aca_pipeline_jobs_total',
    help: 'Total number of AI pipeline jobs processed',
    labelNames: ['status', 'step'],
    registers: [this.registry],
  });

  public readonly gpuUtilization = new Histogram({
    name: 'aca_gpu_utilization_percent',
    help: 'Distribution of GPU utilization percentages',
    labelNames: ['node_id'],
    buckets: [10, 20, 50, 70, 90, 100],
    registers: [this.registry],
  });

  getMetrics() {
    return this.registry.metrics();
  }
}

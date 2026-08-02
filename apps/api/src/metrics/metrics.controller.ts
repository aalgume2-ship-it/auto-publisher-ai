/**
 * GET /metrics — Prometheus text exposition (requirement 9; public for the
 * scraper path behind network policy, which Deployment.md owns).
 */
import { Controller, Get, Header, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/auth.guard.js';
import { HttpMetrics } from '../common/telemetry/http-metrics.js';

@ApiTags('observability')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: HttpMetrics) {}

  @Public()
  @Get()
  @HttpCode(200)
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ operationId: 'metricsExposition', summary: 'Prometheus metrics (text exposition format)' })
  @ApiProduces('text/plain')
  @ApiResponse({ status: 200, description: 'text/plain exposition (aca_http_* + process default metrics)' })
  async exposition(): Promise<string> {
    return this.metrics.render();
  }
}

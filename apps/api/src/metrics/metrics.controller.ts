/**
 * GET /metrics — Prometheus text exposition (requirement 9; public for the
 * scraper path behind network policy, which Deployment.md owns).
 */
import { Controller, Get, Header, HttpCode, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/auth.guard.js';
import { HttpMetrics } from '../common/telemetry/http-metrics.js';

@ApiTags('observability')
// VERSION_NEUTRAL: the scrape path is version-independent (same reason as
// /health — see that controller's note; both were 404ing under defaultVersion).
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
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

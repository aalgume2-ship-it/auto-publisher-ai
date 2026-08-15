/**
 * Worker bootstrap — long-running queue consumer process.
 * Connects to Redis, listens on BullMQ queues, and executes pipeline steps.
 *
 * Lifecycle:
 * 1. loadConfig() — fail closed
 * 2. initTelemetry() — OTel registered
 * 3. Connect Prisma + Redis
 * 4. Start queue processors
 * 5. Graceful shutdown on SIGTERM
 */

import 'reflect-metadata';
import { loadConfig } from '@aca/config';
import { createLogger } from '@aca/logger';
import { createPrismaClient } from '@aca/database';
import { initTelemetry } from './common/telemetry/telemetry.js';
import { WorkerContainer } from './common/worker.container.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    service: 'apps/worker',
    level: config.observability.logLevel,
    pretty: config.nodeEnv === 'development',
    version: config.version,
    environment: config.nodeEnv,
  });
  const telemetry = initTelemetry(config);

  logger.info({ module: 'bootstrap', version: config.version }, 'worker.starting');

  const prisma = createPrismaClient();
  const container = new WorkerContainer(config, prisma, logger);

  try {
    await container.start();
    logger.info({ module: 'bootstrap' }, 'worker.ready');
  } catch (err: unknown) {
    logger.error({ err, module: 'bootstrap' }, 'worker.start.failed');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, module: 'bootstrap' }, 'worker.shutdown.started');
    try {
      await container.stop();
      await telemetry.shutdown();
      await prisma.$disconnect();
      logger.info({ signal, module: 'bootstrap' }, 'worker.shutdown.complete');
      process.exit(0);
    } catch (err: unknown) {
      logger.error({ err, signal, module: 'bootstrap' }, 'worker.shutdown.failed');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();

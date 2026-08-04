import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  
  const logger = new Logger('WorkerBootstrap');
  logger.log('🚀 AI Enterprise Worker initialized and consuming queues...');
}
bootstrap();

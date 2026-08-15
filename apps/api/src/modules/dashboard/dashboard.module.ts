/** Dashboard module — real stats from the database. */
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';

@Module({
  controllers: [DashboardController],
})
export class DashboardModule {}

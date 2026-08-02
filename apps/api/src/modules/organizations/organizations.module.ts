/**
 * OrganizationsModule — Module 1 surface (API.md §4/§5, ADR-027). Controllers
 * are thin; services hold all business logic; platform providers (tenant
 * client factory, outbox, audit, domain operations) come from the global
 * CommonModule — nothing platform-level is re-provided here.
 */
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}

/**
 * OrganizationsModule — Module 1 surface (API.md §4/§5, ADR-027). Controllers
 * are thin; services hold all business logic; platform providers (tenant
 * client factory, outbox, audit, domain operations) come from the global
 * CommonModule — nothing platform-level is re-provided here.
 */
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  controllers: [OrganizationsController, TeamsController, DepartmentsController],
  providers: [OrganizationsService, TeamsService, DepartmentsService],
  exports: [OrganizationsService, TeamsService, DepartmentsService],
})
export class OrganizationsModule {}

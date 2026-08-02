/**
 * DepartmentsService — org-chart layer above teams (API.md §4.4, ADR-027).
 * Delete detaches teams (departmentId → null) inside the same transaction as
 * the audit row and the domain event.
 */
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import { isUniqueViolation, type OutboxWriter } from '@aca/events';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import { slugify } from './organizations.dto.js';
import type { CreateDepartmentBody, ListDepartmentsQuery, UpdateDepartmentBody } from './departments.dto.js';

const MODULE = 'organizations';

export interface DepartmentDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  teamCount?: number;
}

interface DepartmentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDepartmentDto(row: DepartmentRow, teamCount?: number): DepartmentDto {
  const dto: DepartmentDto = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (teamCount !== undefined) dto.teamCount = teamCount;
  return dto;
}

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  async createDepartment(orgId: string, body: CreateDepartmentBody): Promise<DepartmentDto> {
    return this.ops.measure(MODULE, 'department.create', async () => {
      const slug = body.slug ?? slugify(body.name);
      try {
        return await this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
          const dept = await tx.department.create({
            data: { id: generateId(), orgId, name: body.name, slug, description: body.description ?? null },
          });
          await this.audit.record(tx, {
            orgId,
            action: 'department.created',
            entityType: 'Department',
            entityId: dept.id,
            metadata: { name: dept.name, slug: dept.slug },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.department.created',
              orgId,
              aggregateType: 'Department',
              aggregateId: dept.id,
              payload: { orgId, departmentId: dept.id, name: dept.name, slug: dept.slug },
            },
          ]);
          return toDepartmentDto(dept, 0);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict(`department slug "${slug}" already exists in this organization`);
        throw err;
      }
    });
  }

  async listDepartments(orgId: string, query: ListDepartmentsQuery): Promise<{ data: DepartmentDto[]; nextCursor: string | null }> {
    return this.ops.measure(MODULE, 'department.list', async () => {
      const rows = await this.tenant(this.db, orgId).department.findMany({
        where: query.cursor !== undefined ? { id: { gt: query.cursor } } : {},
        orderBy: { id: 'asc' },
        take: query.limit + 1,
        include: { _count: { select: { teams: true } } },
      });
      const page = rows.slice(0, query.limit);
      const nextCursor = rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null;
      return { data: page.map(({ _count, ...row }) => toDepartmentDto(row, _count.teams)), nextCursor };
    });
  }

  async getDepartment(orgId: string, departmentId: string): Promise<DepartmentDto & { teams: Array<{ id: string; name: string }> }> {
    return this.ops.measure(MODULE, 'department.get', async () => {
      const dept = await this.tenant(this.db, orgId).department.findFirst({
        where: { id: departmentId },
        include: {
          teams: { select: { id: true, name: true }, orderBy: { id: 'asc' } },
          _count: { select: { teams: true } },
        },
      });
      if (dept === null) throw apiErrors.notFound('Department');
      const { teams, _count, ...row } = dept;
      return { ...toDepartmentDto(row, _count.teams), teams };
    });
  }

  async updateDepartment(orgId: string, departmentId: string, body: UpdateDepartmentBody): Promise<DepartmentDto> {
    return this.ops.measure(MODULE, 'department.update', async () => {
      const changed = Object.keys(body).filter((k) => Object.prototype.hasOwnProperty.call(body, k));
      try {
        return await this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
          const dept = await tx.department.update({
            where: { id: departmentId },
            data: {
              ...(body.name !== undefined ? { name: body.name } : {}),
              ...(body.slug !== undefined ? { slug: body.slug } : {}),
              ...(Object.prototype.hasOwnProperty.call(body, 'description') ? { description: body.description ?? null } : {}),
            },
          });
          await this.audit.record(tx, {
            orgId,
            action: 'department.updated',
            entityType: 'Department',
            entityId: departmentId,
            metadata: { changed },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.department.updated',
              orgId,
              aggregateType: 'Department',
              aggregateId: departmentId,
              payload: { orgId, departmentId, changed },
            },
          ]);
          return toDepartmentDto(dept);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict(`department slug "${body.slug ?? ''}" already exists in this organization`);
        throw err;
      }
    });
  }

  /** Delete = detach teams (SetNull semantics, explicit) then remove the row. */
  async deleteDepartment(orgId: string, departmentId: string): Promise<{ deleted: true; teamsDetached: number }> {
    return this.ops.measure(MODULE, 'department.delete', async () => {
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.department.findFirst({ where: { id: departmentId }, select: { id: true } });
        if (existing === null) throw apiErrors.notFound('Department');
        const teamsDetached = (await tx.team.updateMany({ where: { departmentId }, data: { departmentId: null } })).count;
        await tx.department.delete({ where: { id: departmentId } });
        await this.audit.record(tx, {
          orgId,
          action: 'department.deleted',
          entityType: 'Department',
          entityId: departmentId,
          metadata: { teamsDetached },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.department.deleted',
            orgId,
            aggregateType: 'Department',
            aggregateId: departmentId,
            payload: { orgId, departmentId, teamsDetached },
          },
        ]);
        return { deleted: true as const, teamsDetached };
      });
    });
  }
}

/**
 * TeamsService — team CRUD + membership (API.md §4.2). All org-data access via
 * the tenant-scoped client; every mutation is one transaction of
 * write + audit + outbox (ADR-024/027d). Team deletion detaches projects to
 * ORG_WIDE per contract (schema FK is SetNull; visibility flip is explicit).
 */
import { Inject, Injectable } from '@nestjs/common';
import { generateId, type DbClient, type Prisma } from '@aca/database';
import { isUniqueViolation, type OutboxWriter } from '@aca/events';
import { apiErrors } from '../../common/errors/api-error.js';
import { PRISMA, TENANT_CLIENT, type TenantClientFactory } from '../../common/prisma.provider.js';
import { OUTBOX_WRITER } from '../../common/events/outbox.provider.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DomainOperations } from '../../common/telemetry/domain-operations.js';
import type { AddTeamMemberBody, CreateTeamBody, ListTeamsQuery, UpdateTeamBody } from './teams.dto.js';

const MODULE = 'organizations';

export interface TeamDto {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  memberCount?: number;
}

export interface TeamMemberDto {
  userId: string;
  addedAt: Date;
}

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toTeamDto(row: TeamRow, memberCount?: number): TeamDto {
  const dto: TeamDto = {
    id: row.id,
    name: row.name,
    description: row.description,
    departmentId: row.departmentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (memberCount !== undefined) dto.memberCount = memberCount;
  return dto;
}

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PRISMA) private readonly db: DbClient,
    @Inject(TENANT_CLIENT) private readonly tenant: TenantClientFactory,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    private readonly audit: AuditService,
    private readonly ops: DomainOperations,
  ) {}

  private async requireDepartment(orgId: string, departmentId: string): Promise<void> {
    const dept = await this.tenant(this.db, orgId).department.findFirst({ where: { id: departmentId }, select: { id: true } });
    if (dept === null) throw apiErrors.notFound('Department');
  }

  async createTeam(orgId: string, body: CreateTeamBody): Promise<TeamDto> {
    return this.ops.measure(MODULE, 'team.create', async () => {
      if (body.departmentId !== undefined) await this.requireDepartment(orgId, body.departmentId);
      try {
        return await this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
          const team = await tx.team.create({
            data: {
              id: generateId(),
              orgId,
              name: body.name,
              description: body.description ?? null,
              departmentId: body.departmentId ?? null,
            },
          });
          await this.audit.record(tx, {
            orgId,
            action: 'team.created',
            entityType: 'Team',
            entityId: team.id,
            metadata: { name: team.name, departmentId: team.departmentId },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.team.created',
              orgId,
              aggregateType: 'Team',
              aggregateId: team.id,
              payload: {
                orgId,
                teamId: team.id,
                name: team.name,
                ...(team.departmentId !== null ? { departmentId: team.departmentId } : {}),
              },
            },
          ]);
          return toTeamDto(team, 0);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict(`team name "${body.name}" already exists in this organization`);
        throw err;
      }
    });
  }

  /** Cursor pagination on uuidv7 ids (time-ordered — stable + index-only). */
  async listTeams(orgId: string, query: ListTeamsQuery): Promise<{ data: TeamDto[]; nextCursor: string | null }> {
    return this.ops.measure(MODULE, 'team.list', async () => {
      const rows = await this.tenant(this.db, orgId).team.findMany({
        where: query.cursor !== undefined ? { id: { gt: query.cursor } } : {},
        orderBy: { id: 'asc' },
        take: query.limit + 1,
        include: { _count: { select: { members: true } } },
      });
      const page = rows.slice(0, query.limit);
      const nextCursor = rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null;
      return { data: page.map(({ _count, ...row }) => toTeamDto(row, _count.members)), nextCursor };
    });
  }

  async getTeam(orgId: string, teamId: string): Promise<TeamDto & { members: TeamMemberDto[] }> {
    return this.ops.measure(MODULE, 'team.get', async () => {
      const team = await this.tenant(this.db, orgId).team.findFirst({
        where: { id: teamId },
        include: { members: { select: { userId: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
      });
      if (team === null) throw apiErrors.notFound('Team');
      const { members, ...row } = team;
      return { ...toTeamDto(row, members.length), members: members.map((m) => ({ userId: m.userId, addedAt: m.createdAt })) };
    });
  }

  async updateTeam(orgId: string, teamId: string, body: UpdateTeamBody): Promise<TeamDto> {
    return this.ops.measure(MODULE, 'team.update', async () => {
      if (body.departmentId !== undefined && body.departmentId !== null) await this.requireDepartment(orgId, body.departmentId);
      const changed = Object.keys(body).filter((k) => Object.prototype.hasOwnProperty.call(body, k));
      try {
        return await this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
          const data = {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(Object.prototype.hasOwnProperty.call(body, 'description') ? { description: body.description ?? null } : {}),
            ...(Object.prototype.hasOwnProperty.call(body, 'departmentId') ? { departmentId: body.departmentId ?? null } : {}),
          };
          const team = await tx.team.update({ where: { id: teamId }, data });
          await this.audit.record(tx, {
            orgId,
            action: 'team.updated',
            entityType: 'Team',
            entityId: teamId,
            metadata: { changed },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.team.updated',
              orgId,
              aggregateType: 'Team',
              aggregateId: teamId,
              payload: { orgId, teamId, changed },
            },
          ]);
          return toTeamDto(team);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict(`team name "${body.name ?? ''}" already exists in this organization`);
        throw err;
      }
    });
  }

  /** Delete = remove row; members cascade; projects detach (teamId null) + flip ORG_WIDE. */
  async deleteTeam(orgId: string, teamId: string): Promise<{ deleted: true; membersRemoved: number; projectsDetached: number }> {
    return this.ops.measure(MODULE, 'team.delete', async () => {
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const existing = await tx.team.findFirst({ where: { id: teamId }, select: { id: true } });
        if (existing === null) throw apiErrors.notFound('Team');
        const membersRemoved = (await tx.teamMember.deleteMany({ where: { teamId } })).count;
        const projectsDetached = (
          await tx.project.updateMany({ where: { teamId }, data: { teamId: null, visibility: 'ORG_WIDE' } })
        ).count;
        await tx.team.delete({ where: { id: teamId } });
        await this.audit.record(tx, {
          orgId,
          action: 'team.deleted',
          entityType: 'Team',
          entityId: teamId,
          metadata: { membersRemoved, projectsDetached },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.team.deleted',
            orgId,
            aggregateType: 'Team',
            aggregateId: teamId,
            payload: { orgId, teamId, membersRemoved, projectsDetached },
          },
        ]);
        return { deleted: true as const, membersRemoved, projectsDetached };
      });
    });
  }

  async addMember(orgId: string, teamId: string, body: AddTeamMemberBody): Promise<TeamMemberDto> {
    return this.ops.measure(MODULE, 'team.member.add', async () => {
      const tenantDb = this.tenant(this.db, orgId);
      const team = await tenantDb.team.findFirst({ where: { id: teamId }, select: { id: true } });
      if (team === null) throw apiErrors.notFound('Team');
      const membership = await tenantDb.organizationMember.findFirst({
        where: { userId: body.userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (membership === null) throw apiErrors.notFound('OrganizationMember');
      try {
        return await tenantDb.$transaction(async (tx: Prisma.TransactionClient) => {
          const row = await tx.teamMember.create({
            data: { id: generateId(), teamId, userId: body.userId },
            select: { userId: true, createdAt: true },
          });
          await this.audit.record(tx, {
            orgId,
            action: 'team.member_added',
            entityType: 'Team',
            entityId: teamId,
            metadata: { userId: body.userId },
          });
          await this.outbox.write(tx, [
            {
              type: 'aca.team.member_added',
              orgId,
              aggregateType: 'Team',
              aggregateId: teamId,
              payload: { orgId, teamId, userId: body.userId },
            },
          ]);
          return { userId: row.userId, addedAt: row.createdAt };
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw apiErrors.conflict('user is already a member of this team');
        throw err;
      }
    });
  }

  async removeMember(orgId: string, teamId: string, userId: string): Promise<{ removed: true }> {
    return this.ops.measure(MODULE, 'team.member.remove', async () => {
      return this.tenant(this.db, orgId).$transaction(async (tx: Prisma.TransactionClient) => {
        const team = await tx.team.findFirst({ where: { id: teamId }, select: { id: true } });
        if (team === null) throw apiErrors.notFound('Team');
        const removed = (await tx.teamMember.deleteMany({ where: { teamId, userId } })).count;
        if (removed === 0) throw apiErrors.notFound('TeamMember');
        await this.audit.record(tx, {
          orgId,
          action: 'team.member_removed',
          entityType: 'Team',
          entityId: teamId,
          metadata: { userId },
        });
        await this.outbox.write(tx, [
          {
            type: 'aca.team.member_removed',
            orgId,
            aggregateType: 'Team',
            aggregateId: teamId,
            payload: { orgId, teamId, userId },
          },
        ]);
        return { removed: true as const };
      });
    });
  }
}

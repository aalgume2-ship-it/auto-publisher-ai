/**
 * TeamsController — /organizations/:orgId/teams routes (API.md §4.2).
 * Thin by rule: context/params in, one service call out. Class-level
 * @TenantRequired — every route here is tenant-scoped.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TenantRequired } from '../../common/auth/tenant.guard.js';
import { RequiresCapabilities } from '../../common/guards/rbac.guard.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import {
  AddTeamMemberBody,
  AddTeamMemberBodyDoc,
  CreateTeamBody,
  CreateTeamBodyDoc,
  ListTeamsQuery,
  TeamListDoc,
  TeamDoc,
  TeamMemberDoc,
  TeamMemberParamsSchema,
  TeamParamsSchema,
  UpdateTeamBody,
  UpdateTeamBodyDoc,
} from './teams.dto.js';
import { TeamsService } from './teams.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };
const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };
const TEAM_PARAM = { name: 'teamId' as const, format: 'uuid' };

@ApiTags('teams')
@Controller({ path: 'organizations/:orgId/teams', version: '1' })
@TenantRequired()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post()
  @HttpCode(201)
  @RequiresCapabilities('team.manage')
  @Idempotent()
  @UseZod({ params: TeamParamsSchema.pick({ orgId: true }), body: CreateTeamBody })
  @ApiOperation({ operationId: 'createTeam', summary: 'Create a team (team.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: CreateTeamBodyDoc })
  @ApiCreatedResponse({ description: 'Team created', schema: TeamDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing team.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiNotFoundResponse({ description: 'Department not in this org / org invisible', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Team name already exists in this organization', content: { 'application/problem+json': { schema: PROBLEM } } })
  createTeam(@Param('orgId') orgId: string, @Body() body: CreateTeamBody) {
    return this.teams.createTeam(orgId, body);
  }

  @Get()
  @UseZod({ params: TeamParamsSchema.pick({ orgId: true }), query: ListTeamsQuery })
  @ApiOperation({ operationId: 'listTeams', summary: 'List teams (cursor-paginated, incl. member counts)' })
  @ApiParam(ORG_PARAM)
  @ApiQuery({ name: 'limit', required: false, type: 'integer', example: 50, description: '1..100, default 50' })
  @ApiQuery({ name: 'cursor', required: false, type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'Team page', schema: TeamListDoc })
  listTeams(@Param('orgId') orgId: string, @Query() query: ListTeamsQuery) {
    return this.teams.listTeams(orgId, query);
  }

  @Get(':teamId')
  @UseZod({ params: TeamParamsSchema })
  @ApiOperation({ operationId: 'getTeam', summary: 'Team detail incl. members' })
  @ApiParam(ORG_PARAM)
  @ApiParam(TEAM_PARAM)
  @ApiOkResponse({ description: 'Team detail', schema: { allOf: [TeamDoc, { type: 'object', properties: { members: { type: 'array', items: TeamMemberDoc } } }] } })
  @ApiNotFoundResponse({ description: 'Team not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  getTeam(@Param('orgId') orgId: string, @Param('teamId') teamId: string) {
    return this.teams.getTeam(orgId, teamId);
  }

  @Patch(':teamId')
  @RequiresCapabilities('team.manage')
  @Idempotent()
  @UseZod({ params: TeamParamsSchema, body: UpdateTeamBody })
  @ApiOperation({ operationId: 'updateTeam', summary: 'Update team name/description/department (team.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(TEAM_PARAM)
  @ApiBody({ schema: UpdateTeamBodyDoc })
  @ApiOkResponse({ description: 'Updated team', schema: TeamDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiNotFoundResponse({ description: 'Team or department not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Team name already exists in this organization', content: { 'application/problem+json': { schema: PROBLEM } } })
  updateTeam(@Param('orgId') orgId: string, @Param('teamId') teamId: string, @Body() body: UpdateTeamBody) {
    return this.teams.updateTeam(orgId, teamId, body);
  }

  @Delete(':teamId')
  @RequiresCapabilities('team.manage')
  @Idempotent()
  @UseZod({ params: TeamParamsSchema })
  @ApiOperation({
    operationId: 'deleteTeam',
    summary: 'Delete team (team.manage) — members cascade; projects detach to ORG_WIDE',
  })
  @ApiParam(ORG_PARAM)
  @ApiParam(TEAM_PARAM)
  @ApiOkResponse({
    description: 'Deletion summary',
    schema: { type: 'object', properties: { deleted: { type: 'boolean', example: true }, membersRemoved: { type: 'integer', example: 3 }, projectsDetached: { type: 'integer', example: 2 } } },
  })
  @ApiNotFoundResponse({ description: 'Team not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  deleteTeam(@Param('orgId') orgId: string, @Param('teamId') teamId: string) {
    return this.teams.deleteTeam(orgId, teamId);
  }

  @Post(':teamId/members')
  @HttpCode(201)
  @RequiresCapabilities('team.manage')
  @Idempotent()
  @UseZod({ params: TeamParamsSchema, body: AddTeamMemberBody })
  @ApiOperation({ operationId: 'addTeamMember', summary: 'Add an ACTIVE org member to the team (team.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(TEAM_PARAM)
  @ApiBody({ schema: AddTeamMemberBodyDoc })
  @ApiCreatedResponse({ description: 'Membership created', schema: TeamMemberDoc })
  @ApiNotFoundResponse({ description: 'Team or org member not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'User is already a member of this team', content: { 'application/problem+json': { schema: PROBLEM } } })
  addMember(@Param('orgId') orgId: string, @Param('teamId') teamId: string, @Body() body: AddTeamMemberBody) {
    return this.teams.addMember(orgId, teamId, body);
  }

  @Delete(':teamId/members/:userId')
  @RequiresCapabilities('team.manage')
  @Idempotent()
  @UseZod({ params: TeamMemberParamsSchema })
  @ApiOperation({ operationId: 'removeTeamMember', summary: 'Remove a user from the team (team.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(TEAM_PARAM)
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOkResponse({ description: 'Membership removed', schema: { type: 'object', properties: { removed: { type: 'boolean', example: true } } } })
  @ApiNotFoundResponse({ description: 'Team or team member not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  removeMember(@Param('orgId') orgId: string, @Param('teamId') teamId: string, @Param('userId') userId: string) {
    return this.teams.removeMember(orgId, teamId, userId);
  }
}

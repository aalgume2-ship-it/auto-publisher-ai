/**
 * DepartmentsController — /organizations/:orgId/departments (API.md §4.4).
 * Thin by rule; class-level @TenantRequired; department.manage on mutations.
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
import { OrgParamsSchema } from './organizations.dto.js';
import {
  CreateDepartmentBody,
  CreateDepartmentBodyDoc,
  DepartmentDoc,
  DepartmentListDoc,
  DepartmentParamsSchema,
  ListDepartmentsQuery,
  UpdateDepartmentBody,
  UpdateDepartmentBodyDoc,
} from './departments.dto.js';
import { DepartmentsService } from './departments.service.js';

const PROBLEM = { $ref: '#/components/schemas/ProblemDetails' };
const ORG_PARAM = { name: 'orgId' as const, format: 'uuid' };
const DEPT_PARAM = { name: 'departmentId' as const, format: 'uuid' };

@ApiTags('departments')
@Controller({ path: 'organizations/:orgId/departments', version: '1' })
@TenantRequired()
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post()
  @HttpCode(201)
  @RequiresCapabilities('department.manage')
  @Idempotent()
  @UseZod({ params: OrgParamsSchema, body: CreateDepartmentBody })
  @ApiOperation({ operationId: 'createDepartment', summary: 'Create a department (department.manage); slug auto-derives from name' })
  @ApiParam(ORG_PARAM)
  @ApiBody({ schema: CreateDepartmentBodyDoc })
  @ApiCreatedResponse({ description: 'Department created', schema: DepartmentDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiForbiddenResponse({ description: 'Missing department.manage capability', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Slug already exists in this organization', content: { 'application/problem+json': { schema: PROBLEM } } })
  createDepartment(@Param('orgId') orgId: string, @Body() body: CreateDepartmentBody) {
    return this.departments.createDepartment(orgId, body);
  }

  @Get()
  @UseZod({ params: OrgParamsSchema, query: ListDepartmentsQuery })
  @ApiOperation({ operationId: 'listDepartments', summary: 'List departments (cursor-paginated, incl. team counts)' })
  @ApiParam(ORG_PARAM)
  @ApiQuery({ name: 'limit', required: false, type: 'integer', example: 50, description: '1..100, default 50' })
  @ApiQuery({ name: 'cursor', required: false, type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'Department page', schema: DepartmentListDoc })
  listDepartments(@Param('orgId') orgId: string, @Query() query: ListDepartmentsQuery) {
    return this.departments.listDepartments(orgId, query);
  }

  @Get(':departmentId')
  @UseZod({ params: DepartmentParamsSchema })
  @ApiOperation({ operationId: 'getDepartment', summary: 'Department detail incl. its teams' })
  @ApiParam(ORG_PARAM)
  @ApiParam(DEPT_PARAM)
  @ApiOkResponse({
    description: 'Department detail',
    schema: { allOf: [DepartmentDoc, { type: 'object', properties: { teams: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string', example: 'Shorts Squad' } } } } } }] },
  })
  @ApiNotFoundResponse({ description: 'Department not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  getDepartment(@Param('orgId') orgId: string, @Param('departmentId') departmentId: string) {
    return this.departments.getDepartment(orgId, departmentId);
  }

  @Patch(':departmentId')
  @RequiresCapabilities('department.manage')
  @Idempotent()
  @UseZod({ params: DepartmentParamsSchema, body: UpdateDepartmentBody })
  @ApiOperation({ operationId: 'updateDepartment', summary: 'Update department (department.manage)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(DEPT_PARAM)
  @ApiBody({ schema: UpdateDepartmentBodyDoc })
  @ApiOkResponse({ description: 'Updated department', schema: DepartmentDoc })
  @ApiBadRequestResponse({ description: 'Body failed validation', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiNotFoundResponse({ description: 'Department not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Slug already exists in this organization', content: { 'application/problem+json': { schema: PROBLEM } } })
  updateDepartment(@Param('orgId') orgId: string, @Param('departmentId') departmentId: string, @Body() body: UpdateDepartmentBody) {
    return this.departments.updateDepartment(orgId, departmentId, body);
  }

  @Delete(':departmentId')
  @RequiresCapabilities('department.manage')
  @Idempotent()
  @UseZod({ params: DepartmentParamsSchema })
  @ApiOperation({ operationId: 'deleteDepartment', summary: 'Delete department (department.manage) — teams detach (departmentId null)' })
  @ApiParam(ORG_PARAM)
  @ApiParam(DEPT_PARAM)
  @ApiOkResponse({
    description: 'Deletion summary',
    schema: { type: 'object', properties: { deleted: { type: 'boolean', example: true }, teamsDetached: { type: 'integer', example: 4 } } },
  })
  @ApiNotFoundResponse({ description: 'Department not visible in this org', content: { 'application/problem+json': { schema: PROBLEM } } })
  deleteDepartment(@Param('orgId') orgId: string, @Param('departmentId') departmentId: string) {
    return this.departments.deleteDepartment(orgId, departmentId);
  }
}

/**
 * Departments — request contracts + OpenAPI doc schemas (API.md §4.4, ADR-027).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';
import { OrgParamsSchema, SlugSchema } from './organizations.dto.js';

export const DepartmentParamsSchema = OrgParamsSchema.extend({ departmentId: UuidV7Schema });

export const CreateDepartmentBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: SlugSchema.optional(),
    description: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type CreateDepartmentBody = z.infer<typeof CreateDepartmentBody>;

export const UpdateDepartmentBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: SlugSchema.optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
export type UpdateDepartmentBody = z.infer<typeof UpdateDepartmentBody>;

export const ListDepartmentsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: UuidV7Schema.optional(),
  })
  .strict();
export type ListDepartmentsQuery = z.infer<typeof ListDepartmentsQuery>;

/* ---------------- OpenAPI documentation (real examples) ---------------- */

export const DepartmentDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid', example: '01924d3a-9c2d-7e8f-b4c3-5d6e7f8a9b0c' },
    name: { type: 'string', example: 'Content Production' },
    slug: { type: 'string', example: 'content-production' },
    description: { type: 'string', nullable: true, example: 'All video-producing teams' },
    createdAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    updatedAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    teamCount: { type: 'integer', example: 3 },
  },
};

export const CreateDepartmentBodyDoc = {
  type: 'object' as const,
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'Content Production' },
    slug: { type: 'string', example: 'content-production' },
    description: { type: 'string', example: 'All video-producing teams' },
  },
};

export const UpdateDepartmentBodyDoc = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', example: 'Content & Media' },
    slug: { type: 'string', example: 'content-media' },
    description: { type: 'string', nullable: true, example: null },
  },
};

export const DepartmentListDoc = {
  type: 'object' as const,
  properties: {
    data: { type: 'array', items: DepartmentDoc },
    nextCursor: { type: 'string', format: 'uuid', nullable: true, example: null },
  },
};

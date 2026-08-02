/**
 * Teams — request contracts + OpenAPI doc schemas (API.md §4.2).
 */
import { z } from 'zod';
import { UuidV7Schema } from '@aca/shared';
import { OrgParamsSchema } from './organizations.dto.js';

export const TeamParamsSchema = OrgParamsSchema.extend({ teamId: UuidV7Schema });
export const TeamMemberParamsSchema = TeamParamsSchema.extend({ userId: UuidV7Schema });

export const CreateTeamBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500).optional(),
    departmentId: UuidV7Schema.optional(),
  })
  .strict();
export type CreateTeamBody = z.infer<typeof CreateTeamBody>;

/** `null` departmentId detaches the team from its department; omission leaves it unchanged. */
export const UpdateTeamBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
    departmentId: UuidV7Schema.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'at least one field is required');
export type UpdateTeamBody = z.infer<typeof UpdateTeamBody>;

export const ListTeamsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: UuidV7Schema.optional(),
  })
  .strict();
export type ListTeamsQuery = z.infer<typeof ListTeamsQuery>;

export const AddTeamMemberBody = z.object({ userId: UuidV7Schema }).strict();
export type AddTeamMemberBody = z.infer<typeof AddTeamMemberBody>;

/* ---------------- OpenAPI documentation (real examples) ---------------- */

export const TeamDoc = {
  type: 'object' as const,
  properties: {
    id: { type: 'string', format: 'uuid', example: '01924d3a-8b1c-7d9f-a3b2-4c5d6e7f8a9b' },
    name: { type: 'string', example: 'Shorts Squad' },
    description: { type: 'string', nullable: true, example: 'Daily TikTok/Shorts production' },
    departmentId: { type: 'string', format: 'uuid', nullable: true, example: '01924d3a-9c2d-7e8f-b4c3-5d6e7f8a9b0c' },
    createdAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    updatedAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:30:00.000Z' },
    memberCount: { type: 'integer', example: 3 },
  },
};

export const CreateTeamBodyDoc = {
  type: 'object' as const,
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'Shorts Squad' },
    description: { type: 'string', example: 'Daily TikTok/Shorts production' },
    departmentId: { type: 'string', format: 'uuid', example: '01924d3a-9c2d-7e8f-b4c3-5d6e7f8a9b0c' },
  },
};

export const UpdateTeamBodyDoc = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', example: 'Shorts & Reels Squad' },
    description: { type: 'string', nullable: true, example: 'Vertical video production' },
    departmentId: { type: 'string', format: 'uuid', nullable: true, example: null },
  },
};

export const TeamListDoc = {
  type: 'object' as const,
  properties: {
    data: { type: 'array', items: TeamDoc },
    nextCursor: { type: 'string', format: 'uuid', nullable: true, example: null },
  },
};

export const AddTeamMemberBodyDoc = {
  type: 'object' as const,
  required: ['userId'],
  properties: { userId: { type: 'string', format: 'uuid', example: '01924d3a-7c2f-7f3e-8e2b-1c2d3e4f5a6c' } },
};

export const TeamMemberDoc = {
  type: 'object' as const,
  properties: {
    userId: { type: 'string', format: 'uuid', example: '01924d3a-7c2f-7f3e-8e2b-1c2d3e4f5a6c' },
    addedAt: { type: 'string', format: 'date-time', example: '2026-08-02T09:45:00.000Z' },
  },
};

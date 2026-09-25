import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createSessionSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query cannot exceed 2000 characters'),
  userId: z
    .string()
    .regex(objectIdRegex, 'userId must be a valid 24-character hexadecimal ObjectId')
    .optional(),
});

export const listSessionsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => !isNaN(val) && val >= 1, 'Page must be an integer greater than or equal to 1'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine(
      (val) => !isNaN(val) && val >= 1 && val <= 100,
      'Limit must be an integer between 1 and 100',
    ),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
});

export const sessionParamSchema = z.object({
  id: z
    .string()
    .regex(objectIdRegex, 'Session ID must be a valid 24-character hexadecimal ObjectId'),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type SessionParam = z.infer<typeof sessionParamSchema>;

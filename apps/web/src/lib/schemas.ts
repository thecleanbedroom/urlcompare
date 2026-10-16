/**
 * Zod schemas for API request validation.
 */
import { z } from 'zod'

export const ComparisonConfigSchema = z.object({
  followRedirects: z.boolean().optional(),
  maxConcurrency: z.number().int().min(1).max(50).optional(),
  retryAttempts: z.number().int().min(0).max(10).optional(),
  timeoutSeconds: z.number().int().min(1).max(60).optional(),
  useOverrideToken: z.boolean().optional(),
  edgeOverrideToken: z.string().optional(),
}).optional()

export const ComparisonRequestSchema = z.object({
  sourceUrls: z.array(z.string().url()).min(1, 'At least one source URL is required'),
  newDomain: z.string().url('New domain must be a valid URL'),
  config: ComparisonConfigSchema,
  name: z.string().max(255).optional(),
})

export const CrawlRequestSchema = z.object({
  sourceDomain: z.string().url('Source domain must be a valid URL'),
  name: z.string().max(255).optional(),
  maxPages: z.number().int().min(1).max(5000).optional(),
  maxDepth: z.number().int().min(1).max(50).optional(),
  delayMs: z.number().int().min(0).max(5000).optional(),
  excludePatterns: z.array(z.string()).optional(),
  includePatterns: z.array(z.string()).optional(),
  useOverrideToken: z.boolean().optional(),
  edgeOverrideToken: z.string().optional(),
})

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

export type ComparisonConfigInput = z.infer<typeof ComparisonConfigSchema>
export type ComparisonRequestInput = z.infer<typeof ComparisonRequestSchema>
export type CrawlRequestInput = z.infer<typeof CrawlRequestSchema>

/** Discovery (crawl + sitemap + gsc) request — replaces CrawlRequest for new jobs. */
export const StartDiscoveryRequestSchema = z.object({
  sourceDomain: z.string().url('Source domain must be a valid URL'),
  sources: z.array(z.enum(['crawl', 'sitemap', 'gsc'])).min(1, 'At least one source is required'),
  name: z.string().max(255).optional(),
  maxPages: z.number().int().min(1).max(50000).optional(),
  maxDepth: z.number().int().min(1).max(1000).optional(),
  delayMs: z.number().int().min(0).max(5000).optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  queryPolicy: z.enum(['ignore', 'allow', 'deny']).optional(),
  queryAllowKeys: z.array(z.string()).optional(),
  queryDenyKeys: z.array(z.string()).optional(),
  normalizeQuery: z.boolean().optional(),
  ignoreAnchors: z.boolean().optional(),
  useOverrideToken: z.boolean().optional(),
  edgeOverrideToken: z.string().optional(),
})

export const PatchUrlSetRequestSchema = z.object({
  included: z.array(z.object({
    urlId: z.string().min(1),
    included: z.boolean(),
  })).optional(),
  addManualUrls: z.array(z.string().url()).optional(),
})

export const StartComparisonRequestSchema = z.object({
  urlSetId: z.string().min(1).optional(),
  sourceUrls: z.array(z.string().url()).min(1).optional(),
  newDomain: z.string().url('New domain must be a valid URL'),
  config: ComparisonConfigSchema,
  name: z.string().max(255).optional(),
}).refine(
  data => (data.urlSetId === undefined) !== (data.sourceUrls === undefined),
  { message: 'Exactly one of urlSetId or sourceUrls is required' }
)

export const CheckUrlRequestSchema = z.object({
  sourceUrl: z.string().url(),
  newDomain: z.string().min(1),
  config: ComparisonConfigSchema,
})

export type StartDiscoveryRequest = z.infer<typeof StartDiscoveryRequestSchema>
export type PatchUrlSetRequest = z.infer<typeof PatchUrlSetRequestSchema>
export type StartComparisonRequest = z.infer<typeof StartComparisonRequestSchema>
export type CheckUrlRequest = z.infer<typeof CheckUrlRequestSchema>

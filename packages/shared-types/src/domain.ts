/**
 * Domain types shared across web, api-server, and mcp-server.
 */

export type ResultStatus = 'OK' | 'Missing' | 'Error' | 'Redirected'

export interface ComparisonResult {
  sourceUrl: string
  newUrl: string
  statusCode: number | null
  redirectChain: string[]
  finalUrl: string | null
  result: ResultStatus
  error?: string
  retryCount: number
  checkedAt: string
}

export interface CheckUrlConfig {
  followRedirects?: boolean
  retryAttempts?: number
  timeoutSeconds?: number
  useOverrideToken?: boolean
  edgeOverrideToken?: string
  signal?: AbortSignal
}

/**
 * A UrlResult as the API/frontend sees it — ComparisonResult fields plus
 * DB identity, with relaxed optionals for partially-populated rows.
 */
export interface UrlResult {
  id?: string
  sourceUrl: string
  newUrl: string
  statusCode: number | null
  redirectChain: string[]
  finalUrl: string | null
  result: ResultStatus
  error?: string
  retryCount?: number
  checkedAt?: string
}

export interface JobSummary {
  totalUrls: number
  ok: number
  redirected: number
  missing: number
  error: number
}

export type StatusFilter = 'all' | 'ok' | 'redirected' | 'not-found'

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DiscoverySource = 'crawl' | 'sitemap' | 'gsc' | 'manual'

export type QueryStringPolicy = 'ignore' | 'allow' | 'deny'

export interface CrawlerOptions {
  maxPages: number
  maxDepth: number
  delayMs: number
  includePatterns?: string[]
  excludePatterns?: string[]
  useOverrideToken?: boolean
  edgeOverrideToken?: string
  queryPolicy?: QueryStringPolicy
  queryAllowKeys?: string[]
  queryDenyKeys?: string[]
  normalizeQuery?: boolean
  ignoreAnchors?: boolean
  onProgress?: (visited: number, discovered: number, currentUrl: string) => void
  onError?: (url: string, error: Error) => void
  signal?: AbortSignal
}

export interface CrawlResult {
  discoveredUrls: string[]
  visitedCount: number
  errorCount: number
  errors: Array<{ url: string; error: string }>
}

/** A UrlSet with its URLs as the API exposes it. */
export interface DiscoveredUrlDto {
  id: string
  url: string
  sources: DiscoverySource[]
  included: boolean
}

export interface UrlSetDto {
  id: string
  name: string | null
  jobId: string | null
  createdAt: string
  urlCount?: number
}

export interface DiscoveryJobDto {
  id: string
  name: string | null
  sourceDomain: string
  status: JobStatus
  sources: DiscoverySource[]
  maxPages: number
  maxDepth: number
  delayMs: number
  pagesVisited: number
  errorCount: number
  lastError: string | null
  urlSetId: string | null
  createdAt: string
  completedAt: string | null
}

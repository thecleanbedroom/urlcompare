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

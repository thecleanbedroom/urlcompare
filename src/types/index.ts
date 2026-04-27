/**
 * Shared type definitions for the urlCompare app.
 * Single source of truth for all domain types.
 */

export interface UrlResult {
  id?: string
  sourceUrl: string
  newUrl: string
  statusCode: number | null
  redirectChain: string[]
  finalUrl: string | null
  result: 'OK' | 'Missing' | 'Error' | 'Redirected'
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

/**
 * UrlCompareService — the capability surface shared by REST routes,
 * the in-process MCP mount, and the stdio MCP HTTP client.
 */

import type {
    CheckUrlRequest,
    PatchUrlSetRequest,
    StartComparisonRequest,
    StartDiscoveryRequest,
} from './schemas'
import type {
    ComparisonResult,
    DiscoveredUrlDto,
    DiscoveryJobDto,
    JobStatus,
    JobSummary,
    UrlResult,
} from './domain'

export interface ServiceError {
    code: string
    message: string
    hint?: string
    details?: unknown
}

export function isServiceError(e: unknown): e is ServiceError {
    return !!e && typeof e === 'object' &&
        typeof (e as ServiceError).code === 'string' &&
        typeof (e as ServiceError).message === 'string'
}

export type JobKind = 'comparison' | 'discovery'

export interface JobRef {
    jobId: string
    kind: JobKind
}

export interface DiscoveryJobRef {
    jobId: string
    status: JobStatus
}

export interface ComparisonJobRef {
    jobId: string
    totalUrls: number
}

export interface UrlSetSummary {
    id: string
    name: string | null
    jobId: string | null
    sourceDomain: string | null
    urlCount: number
    createdAt: string | Date
}

export interface UrlSetDetail {
    urlSet: UrlSetSummary
    total: number
    offset: number
    limit: number
    urls: DiscoveredUrlDto[]
}

export interface JobStatusResult {
    kind: JobKind
    jobId: string
    status: JobStatus
    progress?: { completed: number; total: number }
    pagesVisited?: number
    urlSetId?: string | null
    urlCount?: number
    summary?: JobSummary
    lastError?: string | null
}

export interface ComparisonReport {
    job: {
        id: string
        name: string | null
        newDomain: string
        status: JobStatus
        urlSetId: string | null
        createdAt: string | Date
    }
    summary: JobSummary
    results: UrlResult[]
    totalResults: number
}

export interface JobListItem {
    id: string
    name: string | null
    kind: JobKind
    status: JobStatus
    target: string
    createdAt: string | Date
    detail?: string
}

export interface Paged {
    limit?: number
    offset?: number
}

export interface UrlCompareService {
    discoverUrls(input: StartDiscoveryRequest): Promise<DiscoveryJobRef>
    listUrlSets(options?: Paged): Promise<{ total: number; urlSets: UrlSetSummary[] }>
    listDiscoveredUrls(urlSetId: string, options?: Paged): Promise<UrlSetDetail>
    updateUrlSet(urlSetId: string, patch: PatchUrlSetRequest): Promise<UrlSetDetail>
    startComparison(input: StartComparisonRequest): Promise<ComparisonJobRef>
    getJobStatus(jobId: string, kind?: JobKind): Promise<JobStatusResult>
    getComparisonReport(jobId: string, options?: Paged): Promise<ComparisonReport>
    checkUrl(input: CheckUrlRequest): Promise<ComparisonResult>
    cancelJob(jobId: string, kind: JobKind): Promise<{ jobId: string; status: string }>
    listJobs(kind?: JobKind): Promise<{ jobs: JobListItem[] }>
}

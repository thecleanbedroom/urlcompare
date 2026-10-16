/**
 * In-process UrlCompareService — composes the domain services into
 * the unified capability surface consumed by the MCP mount.
 * REST routes call the domain services directly; this facade exists
 * for MCP (and any future adapter).
 */

import { db } from '../lib/db'
import { checkUrlStatus, generateSummary, safeParseJson } from 'shared-logic'
import {
    isServiceError,
    type ComparisonReport,
    type DiscoveredUrlDto,
    type UrlResult,
    type JobKind,
    type JobListItem,
    type JobStatusResult,
    type Paged,
    type ServiceError,
    type UrlCompareService,
    type CheckUrlRequest,
    type PatchUrlSetRequest,
    type StartComparisonRequest,
    type StartDiscoveryRequest,
} from 'shared-types'
import {
    cancelDiscoveryJob,
    createDiscoveryJob,
    getDiscoveryJob,
    listDiscoveryJobs,
} from './discovery-service'
import {
    cancelComparisonJob,
    createComparisonJob,
    getComparisonJob,
} from './comparison-service'
import { getUrlSet, listUrlSets, patchUrlSet } from './urlset-service'
import { getGoogleAccessToken, GscNotConnectedError } from './google-auth-service'

export class ApiServiceError extends Error implements ServiceError {
    constructor(
        public code: string,
        message: string,
        public hint?: string,
        public details?: unknown,
    ) {
        super(message)
    }
}

function notFound(what: string, id: string): ApiServiceError {
    return new ApiServiceError('not_found', `${what} '${id}' was not found`,
        `Call list_jobs or list the resource collection to find a valid id.`)
}

async function resolveComparisonUrls(input: StartComparisonRequest): Promise<{
    sourceUrls: string[]
    urlSetId?: string
}> {
    if (input.urlSetId) {
        const urlSet = await db.urlSet.findUnique({
            where: { id: input.urlSetId },
            include: { urls: { where: { included: true }, select: { url: true } } },
        })
        if (!urlSet) throw notFound('URL set', input.urlSetId)
        if (urlSet.urls.length === 0) {
            throw new ApiServiceError('no_included_urls',
                `URL set '${input.urlSetId}' has no included URLs`,
                'Include at least one URL via the web UI or updateUrlSet.')
        }
        return { sourceUrls: urlSet.urls.map(u => u.url), urlSetId: urlSet.id }
    }
    return { sourceUrls: input.sourceUrls ?? [] }
}

function serviceError(e: unknown): never {
    if (e instanceof GscNotConnectedError) {
        throw new ApiServiceError(e.code, e.message, e.hint)
    }
    if (isServiceError(e)) throw e
    throw e
}

export function createUrlCompareService(): UrlCompareService {
    return {
        async discoverUrls(input: StartDiscoveryRequest) {
            try {
                if (input.sources.includes('gsc')) {
                    await getGoogleAccessToken() // fail fast — throws GscNotConnectedError
                }
                const job = await createDiscoveryJob(input)
                return { jobId: job.id, status: job.status as JobStatusResult['status'] }
            } catch (e) { serviceError(e) }
        },

        async listUrlSets(options?: Paged) {
            return listUrlSets(options?.limit ?? 50, options?.offset ?? 0)
        },

        async listDiscoveredUrls(urlSetId: string, options?: Paged) {
            const data = await getUrlSet(urlSetId, options?.limit ?? 500, options?.offset ?? 0)
            if (!data) throw notFound('URL set', urlSetId)
            return {
                urlSet: {
                    id: data.urlSet.id,
                    name: data.urlSet.name,
                    jobId: data.urlSet.jobId,
                    sourceDomain: data.urlSet.sourceDomain,
                    urlCount: data.total,
                    createdAt: data.urlSet.createdAt,
                },
                total: data.total,
                offset: data.offset,
                limit: data.limit,
                urls: data.urls.map(u => ({
                    ...u,
                    sources: u.sources as DiscoveredUrlDto['sources'],
                })),
            }
        },

        async updateUrlSet(urlSetId: string, patch: PatchUrlSetRequest) {
            const data = await patchUrlSet(urlSetId, patch)
            if (!data) throw notFound('URL set', urlSetId)
            return this.listDiscoveredUrls(urlSetId)
        },

        async startComparison(input: StartComparisonRequest) {
            const { sourceUrls, urlSetId } = await resolveComparisonUrls(input)
            const job = await createComparisonJob({
                sourceUrls,
                newDomain: input.newDomain,
                config: input.config ?? {},
                name: input.name,
                urlSetId,
            })
            return { jobId: job.id, totalUrls: sourceUrls.length }
        },

        async getJobStatus(jobId: string, kind?: JobKind): Promise<JobStatusResult> {
            if (!kind || kind === 'comparison') {
                const data = await getComparisonJob(jobId)
                if (data) {
                    return {
                        kind: 'comparison',
                        jobId,
                        status: data.job.status as JobStatusResult['status'],
                        progress: { completed: data.job.completedUrls, total: data.job.totalUrls },
                        summary: data.summary,
                        lastError: data.job.lastError,
                    }
                }
                if (kind === 'comparison') throw notFound('Comparison job', jobId)
            }
            const discovery = await getDiscoveryJob(jobId)
            if (discovery) {
                return {
                    kind: 'discovery',
                    jobId,
                    status: discovery.status as JobStatusResult['status'],
                    pagesVisited: discovery.pagesVisited,
                    urlSetId: discovery.urlSetId,
                    urlCount: discovery.urlCount,
                    lastError: discovery.lastError,
                }
            }
            throw notFound('Job', jobId)
        },

        async getComparisonReport(jobId: string, options?: Paged): Promise<ComparisonReport> {
            const data = await getComparisonJob(jobId)
            if (!data) throw notFound('Comparison job', jobId)
            const limit = Math.min(options?.limit ?? 500, 5000)
            const results = data.results.slice(options?.offset ?? 0, (options?.offset ?? 0) + limit)
            return {
                job: {
                    id: data.job.id,
                    name: data.job.name,
                    newDomain: data.job.newDomain,
                    status: data.job.status as ComparisonReport['job']['status'],
                    urlSetId: data.job.urlSetId,
                    createdAt: data.job.createdAt,
                },
                summary: data.summary,
                results: results.map(r => ({
                    id: r.id,
                    sourceUrl: r.sourceUrl,
                    newUrl: r.newUrl,
                    statusCode: r.statusCode,
                    redirectChain: safeParseJson<string[]>(r.redirectChain, []),
                    finalUrl: r.finalUrl,
                    result: r.result as UrlResult['result'],
                    error: r.error ?? undefined,
                    retryCount: r.retryCount,
                    checkedAt: r.checkedAt.toISOString(),
                })),
                totalResults: data.results.length,
            }
        },

        async checkUrl(input: CheckUrlRequest) {
            return checkUrlStatus(input.sourceUrl, input.newDomain, input.config ?? {})
        },

        async cancelJob(jobId: string, kind: JobKind) {
            if (kind === 'comparison') {
                const data = await getComparisonJob(jobId)
                if (!data) throw notFound('Comparison job', jobId)
                await cancelComparisonJob(jobId)
            } else {
                const job = await getDiscoveryJob(jobId)
                if (!job) throw notFound('Discovery job', jobId)
                await cancelDiscoveryJob(jobId)
            }
            return { jobId, status: 'cancelled' }
        },

        async listJobs(kind?: JobKind): Promise<{ jobs: JobListItem[] }> {
            const jobs: JobListItem[] = []
            if (!kind || kind === 'comparison') {
                const comparisons = await db.comparisonJob.findMany({
                    orderBy: { createdAt: 'desc' },
                    take: 50,
                })
                for (const job of comparisons) {
                    jobs.push({
                        id: job.id,
                        name: job.name,
                        kind: 'comparison',
                        status: job.status as JobListItem['status'],
                        target: job.newDomain,
                        createdAt: job.createdAt,
                        detail: `${job.completedUrls}/${job.totalUrls} checked`,
                    })
                }
            }
            if (!kind || kind === 'discovery') {
                const { jobs: discoveries } = await listDiscoveryJobs(50)
                for (const job of discoveries) {
                    jobs.push({
                        id: job.id,
                        name: job.name,
                        kind: 'discovery',
                        status: job.status as JobListItem['status'],
                        target: job.sourceDomain,
                        createdAt: job.createdAt,
                        detail: `${job.urlCount} urls found`,
                    })
                }
            }
            jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            return { jobs: jobs.slice(0, 100) }
        },
    }
}

/**
 * HttpUrlCompareService — UrlCompareService implementation over the
 * REST API. Used by the stdio transport, which has no in-process
 * access to the api-server's services.
 */

import {
    isServiceError,
    type CheckUrlRequest,
    type ComparisonResult,
    type JobKind,
    type JobStatus,
    type PatchUrlSetRequest,
    type ServiceError,
    type StartComparisonRequest,
    type StartDiscoveryRequest,
    type UrlCompareService,
    type UrlSetDetail,
    type UrlSetSummary,
} from 'shared-types'

export class HttpServiceError extends Error implements ServiceError {
    constructor(
        public code: string,
        message: string,
        public hint?: string,
        public details?: unknown,
    ) {
        super(message)
    }
}

export class HttpUrlCompareService implements UrlCompareService {
    constructor(
        private baseUrl: string,
        private apiKey?: string,
        private fetchImpl: typeof fetch = fetch,
    ) {}

    private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`

        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (!response.ok) {
            const data = await response.json().catch(() => ({})) as {
                error?: string
                message?: string
                hint?: string
                details?: unknown
            }
            throw new HttpServiceError(
                data.error ?? 'internal_error',
                data.message ?? data.error ?? `HTTP ${response.status}`,
                data.hint,
                data.details,
            )
        }

        if (response.status === 204) return undefined as T
        return response.json() as Promise<T>
    }

    async discoverUrls(input: StartDiscoveryRequest) {
        const data = await this.call<{ jobId: string; status: JobStatus }>(
            'POST', '/api/discovery', input)
        return { jobId: data.jobId, status: data.status }
    }

    async listUrlSets(options?: { limit?: number; offset?: number }) {
        const q = `limit=${options?.limit ?? 50}&offset=${options?.offset ?? 0}`
        return this.call<{ total: number; urlSets: UrlSetSummary[] }>('GET', `/api/urlsets?${q}`)
    }

    async listDiscoveredUrls(urlSetId: string, options?: { limit?: number; offset?: number }) {
        const q = `limit=${options?.limit ?? 500}&offset=${options?.offset ?? 0}`
        return this.call<UrlSetDetail>('GET', `/api/urlsets/${encodeURIComponent(urlSetId)}?${q}`)
    }

    async updateUrlSet(urlSetId: string, patch: PatchUrlSetRequest) {
        return this.call<UrlSetDetail>('PATCH', `/api/urlsets/${encodeURIComponent(urlSetId)}`, patch)
    }

    async startComparison(input: StartComparisonRequest) {
        const data = await this.call<{ jobId: string; totalUrls: number }>(
            'POST', '/api/comparison', input)
        return { jobId: data.jobId, totalUrls: data.totalUrls }
    }

    async getJobStatus(jobId: string, jobKind?: JobKind) {
        if (!jobKind || jobKind === 'comparison') {
            const data = await this.call<{ job?: any; summary?: any }>(
                'GET', `/api/comparison?jobId=${encodeURIComponent(jobId)}`
            ).catch(e => {
                if (jobKind === 'comparison' || !isServiceError(e) || e.code !== 'not_found') throw e
                return null
            })
            if (data?.job) {
                return {
                    kind: 'comparison' as const,
                    jobId,
                    status: data.job.status,
                    progress: { completed: data.job.completedUrls, total: data.job.totalUrls },
                    summary: data.summary,
                    lastError: data.job.lastError,
                }
            }
            if (jobKind === 'comparison') throw new HttpServiceError('not_found', `Comparison job '${jobId}' was not found`)
        }
        const job = await this.call<any>('GET', `/api/discovery/${encodeURIComponent(jobId)}`)
            .catch(e => {
                if (isServiceError(e) && e.code === 'not_found') {
                    throw new HttpServiceError('not_found', `Job '${jobId}' was not found`,
                        'Call list_jobs to find a valid id.')
                }
                throw e
            })
        return {
            kind: 'discovery' as const,
            jobId,
            status: job.status,
            pagesVisited: job.pagesVisited,
            urlSetId: job.urlSetId,
            urlCount: job.urlCount,
            lastError: job.lastError,
        }
    }

    async getComparisonReport(jobId: string, options?: { limit?: number; offset?: number }) {
        const data = await this.call<{ job?: any; summary?: any; results?: any[] }>(
            'GET', `/api/comparison?jobId=${encodeURIComponent(jobId)}`
        )
        if (!data.job) {
            throw new HttpServiceError('not_found', `Comparison job '${jobId}' was not found`)
        }
        const all = data.results ?? []
        const offset = options?.offset ?? 0
        const limit = Math.min(options?.limit ?? 500, 5000)
        return {
            job: {
                id: data.job.id,
                name: data.job.name,
                newDomain: data.job.newDomain,
                status: data.job.status,
                urlSetId: data.job.urlSetId ?? null,
                createdAt: data.job.createdAt,
            },
            summary: data.summary,
            results: all.slice(offset, offset + limit).map((r: any) => ({
                id: r.id,
                sourceUrl: r.sourceUrl,
                newUrl: r.newUrl,
                statusCode: r.statusCode,
                redirectChain: typeof r.redirectChain === 'string' ? JSON.parse(r.redirectChain) : r.redirectChain,
                finalUrl: r.finalUrl,
                result: r.result,
                error: r.error ?? undefined,
                retryCount: r.retryCount,
                checkedAt: r.checkedAt,
            })),
            totalResults: all.length,
        }
    }

    async checkUrl(input: CheckUrlRequest) {
        return this.call<ComparisonResult>('POST', '/api/verify', {
            sourceUrl: input.sourceUrl,
            newDomain: input.newDomain,
            followRedirects: input.config?.followRedirects,
            useOverrideToken: input.config?.useOverrideToken,
            edgeOverrideToken: input.config?.edgeOverrideToken,
        })
    }

    async cancelJob(jobId: string, jobKind: JobKind) {
        if (jobKind === 'comparison') {
            const data = await this.call<{ jobId: string; status: string }>(
                'DELETE', `/api/comparison?jobId=${encodeURIComponent(jobId)}`)
            return { jobId: data.jobId, status: data.status }
        }
        const data = await this.call<{ jobId: string; status: string }>(
            'DELETE', `/api/discovery/${encodeURIComponent(jobId)}`)
        return { jobId: data.jobId, status: data.status }
    }

    async listJobs(jobKind?: JobKind) {
        const jobs: any[] = []
        if (!jobKind || jobKind === 'comparison') {
            const comparisons = await this.call<any[]>('GET', '/api/jobs')
            for (const job of comparisons) {
                jobs.push({
                    id: job.id, name: job.name, kind: 'comparison', status: job.status,
                    target: job.newDomain, createdAt: job.createdAt,
                    detail: `${job.completedUrls}/${job.totalUrls} checked`,
                })
            }
        }
        if (!jobKind || jobKind === 'discovery') {
            const { jobs: discoveries } = await this.call<{ jobs: any[] }>('GET', '/api/discovery')
            for (const job of discoveries) {
                jobs.push({
                    id: job.id, name: job.name, kind: 'discovery', status: job.status,
                    target: job.sourceDomain, createdAt: job.createdAt,
                    detail: `${job.urlCount} urls found`,
                })
            }
        }
        jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        return { jobs: jobs.slice(0, 100) }
    }
}

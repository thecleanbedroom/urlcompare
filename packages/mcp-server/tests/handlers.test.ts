import { describe, expect, it, vi } from 'vitest'
import type { UrlCompareService } from 'shared-types'
import { handleToolCall } from '../src/handlers'

function makeService(overrides: Partial<UrlCompareService> = {}): UrlCompareService {
    return {
        discoverUrls: vi.fn(async () => ({ jobId: 'dj1', status: 'pending' as const })),
        listUrlSets: vi.fn(async () => ({ total: 0, urlSets: [] })),
        listDiscoveredUrls: vi.fn(async () => ({
            urlSet: { id: 's1', name: null, jobId: null, sourceDomain: null, urlCount: 2, createdAt: '' },
            total: 2, offset: 0, limit: 500,
            urls: [
                { id: 'u1', url: 'https://a.com/', sources: ['crawl' as const], included: true },
                { id: 'u2', url: 'https://a.com/b', sources: ['sitemap' as const], included: true },
            ],
        })),
        updateUrlSet: vi.fn(async () => ({ urlSet: {} as never, total: 1, offset: 0, limit: 500, urls: [] })),
        startComparison: vi.fn(async () => ({ jobId: 'cj1', totalUrls: 2 })),
        getJobStatus: vi.fn(async () => ({ kind: 'comparison' as const, jobId: 'cj1', status: 'running' as const })),
        getComparisonReport: vi.fn(async () => ({
            job: { id: 'cj1', name: null, newDomain: 'https://n.com', status: 'completed' as const, urlSetId: null, createdAt: '' },
            summary: { totalUrls: 1, ok: 1, redirected: 0, missing: 0, error: 0 },
            results: [],
            totalResults: 0,
        })),
        checkUrl: vi.fn(async () => ({
            sourceUrl: 'https://a.com/x',
            result: 'OK' as const,
            statusCode: 200,
            newUrl: 'https://n.com/a',
            finalUrl: 'https://n.com/a',
            redirectChain: [],
            retryCount: 0,
            checkedAt: '',
        })),
        cancelJob: vi.fn(async () => ({ jobId: 'cj1', status: 'cancelled' })),
        listJobs: vi.fn(async () => ({ jobs: [] })),
        ...overrides,
    }
}

function textOf(result: { content?: unknown }): string {
    const content = (result as { content: Array<{ text: string }> }).content
    return content[0].text
}

describe('handleToolCall', () => {
    it('maps discover_urls args onto the service request', async () => {
        const service = makeService()
        const result = await handleToolCall(service, 'discover_urls', {
            sourceDomain: 'https://old.com',
            sources: ['sitemap'],
            maxPages: 50,
            queryPolicy: 'deny',
            queryDenyKeys: ['utm_source'],
        })
        expect(service.discoverUrls).toHaveBeenCalledWith(
            expect.objectContaining({
                sourceDomain: 'https://old.com',
                sources: ['sitemap'],
                maxPages: 50,
                queryPolicy: 'deny',
                queryDenyKeys: ['utm_source'],
            })
        )
        expect(JSON.parse(textOf(result))).toEqual({ job_id: 'dj1', status: 'pending' })
        expect(result.isError).toBeUndefined()
    })

    it('defaults sources to crawl+sitemap when omitted', async () => {
        const service = makeService()
        await handleToolCall(service, 'discover_urls', { sourceDomain: 'https://old.com' })
        expect(service.discoverUrls).toHaveBeenCalledWith(
            expect.objectContaining({ sources: ['crawl', 'sitemap'] })
        )
    })

    it('rejects comparisons with both urlSetId and sourceUrls via service error', async () => {
        const service = makeService({
            startComparison: vi.fn(async () => {
                const e = new Error('Exactly one of urlSetId or sourceUrls must be provided') as Error & { code?: string }
                e.code = 'conflicting_params'
                throw e
            }),
        })
        // isServiceError requires code+message on the thrown object
        const result = await handleToolCall(service, 'start_comparison', {
            newDomain: 'https://n.com',
            urlSetId: 's1',
            sourceUrls: ['https://a.com'],
        })
        expect(result.isError).toBe(true)
        const parsed = JSON.parse(textOf(result))
        expect(parsed.error.code).toBe('conflicting_params')
    })

    it('returns snake_case check_url fields', async () => {
        const service = makeService()
        const result = await handleToolCall(service, 'check_url', {
            sourceUrl: 'https://a.com/x', newDomain: 'https://n.com',
        })
        expect(JSON.parse(textOf(result))).toEqual({
            result: 'OK',
            status_code: 200,
            new_url: 'https://n.com/a',
            final_url: 'https://n.com/a',
            redirect_chain: [],
        })
    })

    it('auto-detects job kind for cancel_job via getJobStatus', async () => {
        const service = makeService()
        await handleToolCall(service, 'cancel_job', { jobId: 'cj1' })
        expect(service.getJobStatus).toHaveBeenCalledWith('cj1')
        expect(service.cancelJob).toHaveBeenCalledWith('cj1', 'comparison')
    })

    it('wraps plain errors in the error contract', async () => {
        const service = makeService({
            listJobs: vi.fn(async () => { throw new Error('db exploded') }),
        })
        const result = await handleToolCall(service, 'list_jobs', {})
        expect(result.isError).toBe(true)
        const parsed = JSON.parse(textOf(result))
        expect(parsed.error.code).toBe('internal_error')
        expect(parsed.error.message).toBe('db exploded')
        expect(parsed.error.hint).toBeTruthy()
    })

    it('returns not_found for unknown tools', async () => {
        const service = makeService()
        const result = await handleToolCall(service, 'nope_tool', {})
        expect(result.isError).toBe(true)
        expect(JSON.parse(textOf(result)).error.code).toBe('not_found')
    })
})

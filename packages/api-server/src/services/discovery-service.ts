/**
 * Discovery job lifecycle — runs the requested sources (crawl,
 * sitemap, GSC), canonicalizes all discovered URLs, merges them into
 * a UrlSet with per-URL source attribution.
 */

import { db } from '../lib/db'
import { JobRunner } from '../lib/runner'
import {
    DomainCrawler,
    canonicalizeUrl,
    collectSitemapUrls,
    discoverSitemaps,
    fetchGscPageUrls,
    listGscSites,
    mergeUrlSources,
    resolveGscSite,
    toJsonString,
    safeParseJson,
    type CanonicalizeConfig,
    type UrlSourceList,
} from 'shared-logic'
import type { DiscoverySource, StartDiscoveryRequest } from 'shared-types'
import { getGoogleAccessToken, GscNotConnectedError } from './google-auth-service'

const discoveryRunner = new JobRunner()

export type { StartDiscoveryRequest }

/** Fail-fast precheck: is every requested source usable right now? */
export async function checkDiscoverySources(sources: DiscoverySource[]) {
    if (sources.includes('gsc')) {
        // Throws GscNotConnectedError if no credential — caller maps it.
        await getGoogleAccessToken()
    }
}

export async function createDiscoveryJob(input: StartDiscoveryRequest) {
    const job = await db.discoveryJob.create({
        data: {
            name: input.name || null,
            sourceDomain: input.sourceDomain,
            sources: toJsonString(input.sources),
            maxPages: input.maxPages ?? 10000,
            maxDepth: input.maxDepth ?? 20,
            delayMs: input.delayMs ?? 200,
            includePatterns: input.includePatterns ? toJsonString(input.includePatterns) : null,
            excludePatterns: input.excludePatterns ? toJsonString(input.excludePatterns) : null,
            queryPolicy: input.queryPolicy ?? 'ignore',
            queryAllowKeys: input.queryAllowKeys ? toJsonString(input.queryAllowKeys) : null,
            queryDenyKeys: input.queryDenyKeys ? toJsonString(input.queryDenyKeys) : null,
            normalizeQuery: input.normalizeQuery ?? true,
            ignoreAnchors: input.ignoreAnchors ?? true,
            status: 'pending',
        },
    })

    processDiscoveryJob(job.id, input).catch(error => {
        console.error(`Discovery job ${job.id} failed:`, error)
    })

    return job
}

export async function listDiscoveryJobs(limit = 50, offset = 0) {
    const [total, jobs] = await Promise.all([
        db.discoveryJob.count(),
        db.discoveryJob.findMany({
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 500),
            skip: offset,
            include: { urlSet: { select: { id: true, _count: { select: { urls: true } } } } },
        }),
    ])

    return {
        total,
        jobs: jobs.map(job => ({
            id: job.id,
            name: job.name,
            sourceDomain: job.sourceDomain,
            status: job.status,
            sources: safeParseJson<string[]>(job.sources, []),
            maxPages: job.maxPages,
            maxDepth: job.maxDepth,
            pagesVisited: job.pagesVisited,
            errorCount: job.errorCount,
            lastError: job.lastError,
            urlSetId: job.urlSet?.id ?? null,
            urlCount: job.urlSet?._count.urls ?? 0,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        })),
    }
}

export async function getDiscoveryJob(jobId: string) {
    const job = await db.discoveryJob.findUnique({
        where: { id: jobId },
        include: { urlSet: { select: { id: true, _count: { select: { urls: true } } } } },
    })
    if (!job) return null

    return {
        id: job.id,
        name: job.name,
        sourceDomain: job.sourceDomain,
        status: job.status,
        sources: safeParseJson<string[]>(job.sources, []),
        maxPages: job.maxPages,
        maxDepth: job.maxDepth,
        delayMs: job.delayMs,
        includePatterns: safeParseJson<string[]>(job.includePatterns, []),
        excludePatterns: safeParseJson<string[]>(job.excludePatterns, []),
        queryPolicy: job.queryPolicy,
        queryAllowKeys: safeParseJson<string[]>(job.queryAllowKeys, []),
        queryDenyKeys: safeParseJson<string[]>(job.queryDenyKeys, []),
        normalizeQuery: job.normalizeQuery,
        ignoreAnchors: job.ignoreAnchors,
        pagesVisited: job.pagesVisited,
        errorCount: job.errorCount,
        lastError: job.lastError,
        urlSetId: job.urlSet?.id ?? null,
        urlCount: job.urlSet?._count.urls ?? 0,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
    }
}

export async function cancelDiscoveryJob(jobId: string) {
    discoveryRunner.cancel(jobId)
    return db.discoveryJob.update({
        where: { id: jobId },
        data: { status: 'cancelled', completedAt: new Date() },
    })
}

export async function deleteDiscoveryJob(jobId: string) {
    // UrlSet + DiscoveredUrl rows cascade via jobId on UrlSet.
    return db.discoveryJob.delete({ where: { id: jobId } })
}

async function processDiscoveryJob(jobId: string, input: StartDiscoveryRequest) {
    const controller = discoveryRunner.start(jobId)
    const sources = input.sources as DiscoverySource[]

    const canonicalCfg: CanonicalizeConfig = {
        queryPolicy: input.queryPolicy ?? 'ignore',
        queryAllowKeys: input.queryAllowKeys,
        queryDenyKeys: input.queryDenyKeys,
        normalizeQuery: input.normalizeQuery ?? true,
        ignoreAnchors: input.ignoreAnchors ?? true,
    }
    const canonicalize = (u: string) => canonicalizeUrl(u, canonicalCfg)

    const warnings: string[] = []
    const lists: UrlSourceList[] = []
    let pagesVisited = 0
    let errorCount = 0

    try {
        await db.discoveryJob.update({
            where: { id: jobId },
            data: { status: 'running' },
        })

        if (sources.includes('crawl') && !controller.signal.aborted) {
            const crawler = new DomainCrawler(input.sourceDomain, {
                maxPages: input.maxPages ?? 10000,
                maxDepth: input.maxDepth ?? 20,
                delayMs: input.delayMs ?? 200,
                includePatterns: input.includePatterns,
                excludePatterns: input.excludePatterns,
                useOverrideToken: input.useOverrideToken,
                edgeOverrideToken: input.edgeOverrideToken,
                signal: controller.signal,
                ...canonicalCfg,
                onProgress: (visited) => {
                    pagesVisited = visited
                    db.discoveryJob.update({
                        where: { id: jobId },
                        data: { pagesVisited: visited },
                    }).catch(() => {})
                },
            })

            const result = await crawler.crawl()
            pagesVisited = result.visitedCount
            errorCount += result.errorCount
            lists.push({ source: 'crawl', urls: result.discoveredUrls.map(canonicalize) })
        }

        if (sources.includes('sitemap') && !controller.signal.aborted) {
            try {
                const seeds = await discoverSitemaps(input.sourceDomain)
                const sitemapResult = await collectSitemapUrls(seeds, {
                    signal: controller.signal,
                })
                warnings.push(...sitemapResult.warnings)
                lists.push({ source: 'sitemap', urls: sitemapResult.urls.map(canonicalize) })
            } catch (error) {
                errorCount++
                warnings.push(`Sitemap discovery failed: ${error instanceof Error ? error.message : String(error)}`)
            }
        }

        if (sources.includes('gsc') && !controller.signal.aborted) {
            const accessToken = await getGoogleAccessToken() // throws GscNotConnectedError
            const sites = await listGscSites(accessToken)
            const siteUrl = resolveGscSite(input.sourceDomain, sites)
            if (!siteUrl) {
                throw new Error(
                    `No Search Console property covers ${input.sourceDomain} — ` +
                    `verify the property in Search Console, or choose a different source.`
                )
            }
            const gsc = await fetchGscPageUrls({ accessToken, siteUrl })
            lists.push({ source: 'gsc', urls: gsc.urls.map(canonicalize) })
            if (gsc.truncated) {
                warnings.push(`GSC results truncated at ${gsc.rowsFetched} rows`)
            }
        }

        if (!controller.signal.aborted) {
            const merged = mergeUrlSources(lists)

            const urlSet = await db.urlSet.create({
                data: {
                    jobId,
                    name: input.name || `Discovery ${input.sourceDomain}`,
                },
            })

            for (let i = 0; i < merged.length; i += 500) {
                await db.discoveredUrl.createMany({
                    data: merged.slice(i, i + 500).map(m => ({
                        urlSetId: urlSet.id,
                        url: m.url,
                        sources: toJsonString(m.sources),
                        included: true,
                    })),
                })
            }

            await db.discoveryJob.update({
                where: { id: jobId },
                data: {
                    status: 'completed',
                    pagesVisited,
                    errorCount,
                    lastError: warnings.length > 0 ? warnings.join('; ').slice(0, 2000) : null,
                    completedAt: new Date(),
                },
            })
        }
    } catch (error) {
        if (!controller.signal.aborted) {
            await db.discoveryJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    pagesVisited,
                    errorCount: errorCount + 1,
                    lastError: error instanceof Error ? error.message : String(error),
                    completedAt: new Date(),
                },
            }).catch(() => {})
        }
    } finally {
        discoveryRunner.done(jobId)
    }
}

export { GscNotConnectedError }

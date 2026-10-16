/**
 * Crawl job lifecycle — create, run in background, cancel.
 * Uses shared-logic processCrawlJob with a DB progress callback.
 */

import { db } from '../lib/db'
import { crawlRunner } from '../lib/runner'
import { processCrawlJob, safeParseJson, toJsonString } from 'shared-logic'
import type { CrawlerOptions } from 'shared-types'

export interface CrawlJobInput {
    sourceDomain: string
    name?: string
    maxPages?: number
    maxDepth?: number
    delayMs?: number
    includePatterns?: string[]
    excludePatterns?: string[]
    useOverrideToken?: boolean
    edgeOverrideToken?: string
}

export async function createCrawlJob(input: CrawlJobInput) {
    const job = await db.crawlJob.create({
        data: {
            name: input.name || null,
            sourceDomain: input.sourceDomain,
            maxPages: input.maxPages || 500,
            maxDepth: input.maxDepth || 10,
            delayMs: input.delayMs || 200,
            includePatterns: input.includePatterns ? toJsonString(input.includePatterns) : null,
            excludePatterns: input.excludePatterns ? toJsonString(input.excludePatterns) : null,
            status: 'pending',
        },
    })

    startCrawlInBackground(job.id, input.sourceDomain, {
        maxPages: input.maxPages || 500,
        maxDepth: input.maxDepth || 10,
        delayMs: input.delayMs || 200,
        includePatterns: input.includePatterns,
        excludePatterns: input.excludePatterns,
        useOverrideToken: input.useOverrideToken,
        edgeOverrideToken: input.edgeOverrideToken,
    })

    return job
}

export async function listCrawlJobs() {
    return db.crawlJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
            id: true,
            name: true,
            sourceDomain: true,
            status: true,
            totalDiscovered: true,
            pagesVisited: true,
            errorCount: true,
            createdAt: true,
            completedAt: true,
        },
    })
}

export async function getCrawlJob(jobId: string) {
    const job = await db.crawlJob.findUnique({ where: { id: jobId } })
    if (!job) return null

    const discoveredUrls = job.discoveredUrls
        ? safeParseJson<string[]>(job.discoveredUrls, [])
        : []

    return {
        job: {
            id: job.id,
            name: job.name,
            sourceDomain: job.sourceDomain,
            status: job.status,
            maxPages: job.maxPages,
            maxDepth: job.maxDepth,
            delayMs: job.delayMs,
            totalDiscovered: job.totalDiscovered,
            pagesVisited: job.pagesVisited,
            errorCount: job.errorCount,
            lastError: job.lastError,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
        },
        discoveredUrls: job.status === 'completed' ? discoveredUrls : undefined,
    }
}

export async function cancelCrawlJob(jobId: string) {
    crawlRunner.cancel(jobId)
    return db.crawlJob.update({
        where: { id: jobId },
        data: { status: 'cancelled', completedAt: new Date() },
    })
}

/**
 * Start crawl processing in background.
 */
function startCrawlInBackground(
    jobId: string,
    sourceDomain: string,
    options: {
        maxPages: number;
        maxDepth: number;
        delayMs: number;
        includePatterns?: string[];
        excludePatterns?: string[];
        useOverrideToken?: boolean;
        edgeOverrideToken?: string;
    }
) {
    const controller = crawlRunner.start(jobId)

    processCrawlJob(
        jobId,
        sourceDomain,
        { ...options, signal: controller.signal } as CrawlerOptions,
        async (data) => {
            const updateData: Record<string, unknown> = {
                updatedAt: new Date(),
            }

            if (data.pagesVisited !== undefined) updateData.pagesVisited = data.pagesVisited
            if (data.totalDiscovered !== undefined) updateData.totalDiscovered = data.totalDiscovered
            if (data.status !== undefined) updateData.status = data.status
            if (data.lastError !== undefined) updateData.lastError = data.lastError
            if (data.errorCount !== undefined) updateData.errorCount = data.errorCount
            if (data.discoveredUrls !== undefined) {
                updateData.discoveredUrls = toJsonString(data.discoveredUrls)
            }
            if (data.status === 'completed' || data.status === 'failed') {
                updateData.completedAt = new Date()
            }

            await db.crawlJob.update({
                where: { id: jobId },
                data: updateData,
            })
        }
    ).catch(async (error) => {
        console.error(`Crawl job ${jobId} failed:`, error)
        try {
            const job = await db.crawlJob.findUnique({ where: { id: jobId } })
            if (job && job.status !== 'cancelled') {
                await db.crawlJob.update({
                    where: { id: jobId },
                    data: {
                        status: 'failed',
                        lastError: error instanceof Error ? error.message : String(error),
                        completedAt: new Date(),
                    },
                })
            }
        } catch (updateError) {
            console.error(`Failed to update crawl job ${jobId}:`, updateError)
        }
    }).finally(() => {
        crawlRunner.done(jobId)
    })
}

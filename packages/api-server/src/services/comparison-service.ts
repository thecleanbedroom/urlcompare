/**
 * Comparison job lifecycle — create, run in background, cancel.
 * The job runner checks each source URL's path on the new domain
 * in batches and persists UrlResult rows as it goes.
 */

import { db } from '../lib/db'
import { comparisonRunner } from '../lib/runner'
import { toJsonString, checkUrlStatus, extractPath, constructNewUrl, generateSummary, type ComparisonResult } from 'shared-logic'
import type { CheckUrlConfig } from 'shared-types'

export interface ComparisonJobConfig extends CheckUrlConfig {
    maxConcurrency?: number
}

export async function createComparisonJob(params: {
    sourceUrls: string[]
    newDomain: string
    config: ComparisonJobConfig
    name?: string
    urlSetId?: string
}) {
    const { sourceUrls, newDomain, config, name, urlSetId } = params

    const job = await db.comparisonJob.create({
        data: {
            name: name || `Comparison ${new Date().toISOString()}`,
            sourceUrls: toJsonString(sourceUrls),
            newDomain,
            config: toJsonString(config),
            totalUrls: sourceUrls.length,
            status: 'pending',
            urlSetId,
        }
    })

    processComparisonJob(job.id, sourceUrls, newDomain, config).catch(error => {
        console.error(`Error processing job ${job.id}:`, error)
    })

    return job
}

export async function getComparisonJob(jobId: string) {
    const job = await db.comparisonJob.findUnique({
        where: { id: jobId },
        include: {
            urlResults: {
                orderBy: { checkedAt: 'asc' }
            }
        }
    })
    if (!job) return null
    return { job, summary: generateSummary(job.urlResults), results: job.urlResults }
}

export async function listComparisonJobs() {
    const jobs = await db.comparisonJob.findMany({
        orderBy: { createdAt: 'desc' },
        include: { urlResults: true }
    })
    return jobs.map(job => ({
        ...job,
        summary: generateSummary(job.urlResults)
    }))
}

export async function cancelComparisonJob(jobId: string) {
    comparisonRunner.cancel(jobId)
    await db.comparisonJob.update({
        where: { id: jobId },
        data: { status: 'cancelled' }
    })
}

export async function deleteComparisonJob(jobId: string) {
    await db.$transaction([
        db.urlResult.deleteMany({ where: { jobId } }),
        db.comparisonJob.delete({ where: { id: jobId } }),
    ])
}

async function processComparisonJob(
    jobId: string,
    sourceUrls: string[],
    newDomain: string,
    config: ComparisonJobConfig
) {
    const {
        followRedirects = true,
        maxConcurrency = 10,
        retryAttempts = 3,
        timeoutSeconds = 10,
        useOverrideToken = false,
        edgeOverrideToken = ''
    } = config

    const controller = comparisonRunner.start(jobId)

    try {
        await db.comparisonJob.update({
            where: { id: jobId },
            data: { status: 'running' }
        })

        let completed = 0

        // Process URLs in batches
        for (let i = 0; i < sourceUrls.length; i += maxConcurrency) {
            if (controller.signal.aborted) break

            const batch = sourceUrls.slice(i, i + maxConcurrency)

            const batchResults = await Promise.all(batch.map(async (sourceUrl) => {
                try {
                    return await checkUrlStatus(
                        sourceUrl,
                        newDomain,
                        { followRedirects, retryAttempts, timeoutSeconds, useOverrideToken, edgeOverrideToken, signal: controller.signal }
                    )
                } catch (err) {
                    const errorResult: ComparisonResult = {
                        sourceUrl,
                        newUrl: constructNewUrl(extractPath(sourceUrl), newDomain),
                        statusCode: null,
                        redirectChain: [],
                        finalUrl: null,
                        result: 'Error',
                        error: err instanceof Error ? err.message : 'Unknown error',
                        retryCount: retryAttempts,
                        checkedAt: new Date().toISOString()
                    }
                    return errorResult
                }
            }))

            await db.urlResult.createMany({
                data: batchResults.map(result => ({
                    jobId,
                    sourceUrl: result.sourceUrl,
                    newUrl: result.newUrl,
                    statusCode: result.statusCode,
                    redirectChain: toJsonString(result.redirectChain),
                    finalUrl: result.finalUrl,
                    result: result.result,
                    error: result.error,
                    retryCount: result.retryCount,
                    checkedAt: new Date(result.checkedAt)
                }))
            })

            completed += batch.length

            await db.comparisonJob.update({
                where: { id: jobId },
                data: {
                    completedUrls: completed,
                    status: completed === sourceUrls.length ? 'completed' : 'running'
                }
            })
        }

        if (!controller.signal.aborted) {
            await db.comparisonJob.update({
                where: { id: jobId },
                data: { status: 'completed' }
            })
        }

    } catch (error) {
        if (!controller.signal.aborted) {
            console.error(`Error processing job ${jobId}:`, error)
            await db.comparisonJob.update({
                where: { id: jobId },
                data: {
                    status: 'failed',
                    lastError: error instanceof Error ? error.message : String(error)
                }
            })
        }
    } finally {
        comparisonRunner.done(jobId)
    }
}

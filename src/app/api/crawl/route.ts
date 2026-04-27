import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processCrawlJob } from '@/lib/crawler';
import { safeParseJson, toJsonString } from '@/lib/json';

interface StartCrawlRequest {
    sourceDomain: string;
    name?: string;
    maxPages?: number;
    maxDepth?: number;
    delayMs?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    useOverrideToken?: boolean;
}

// Store active crawl abort controllers
const activeCrawls = new Map<string, AbortController>();

/**
 * POST /api/crawl - Start a new crawl job
 */
export async function POST(request: NextRequest) {
    try {
        const body: StartCrawlRequest = await request.json();

        // Validate required fields
        if (!body.sourceDomain) {
            return NextResponse.json(
                { error: 'sourceDomain is required' },
                { status: 400 }
            );
        }

        // Validate URL format
        try {
            new URL(body.sourceDomain);
        } catch {
            return NextResponse.json(
                { error: 'Invalid sourceDomain URL format' },
                { status: 400 }
            );
        }

        // Create crawl job in database
        const job = await db.crawlJob.create({
            data: {
                name: body.name || null,
                sourceDomain: body.sourceDomain,
                maxPages: body.maxPages || 500,
                maxDepth: body.maxDepth || 10,
                delayMs: body.delayMs || 200,
                includePatterns: body.includePatterns ? toJsonString(body.includePatterns) : null,
                excludePatterns: body.excludePatterns ? toJsonString(body.excludePatterns) : null,
                status: 'pending',
            },
        });

        // Start crawl in background (non-blocking)
        startCrawlInBackground(job.id, body.sourceDomain, {
            maxPages: body.maxPages || 500,
            maxDepth: body.maxDepth || 10,
            delayMs: body.delayMs || 200,
            includePatterns: body.includePatterns,
            excludePatterns: body.excludePatterns,
            useOverrideToken: body.useOverrideToken,
        });

        return NextResponse.json({
            jobId: job.id,
            status: job.status,
            message: 'Crawl job started',
        });
    } catch (error) {
        console.error('Error starting crawl:', error);
        return NextResponse.json(
            { error: 'Failed to start crawl job' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/crawl?jobId=X - Get crawl job status and results
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        // Return all crawl jobs if no jobId specified
        try {
            const jobs = await db.crawlJob.findMany({
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
            });
            return NextResponse.json({ jobs });
        } catch (error) {
            console.error('Error fetching crawl jobs:', error);
            return NextResponse.json(
                { error: 'Failed to fetch crawl jobs' },
                { status: 500 }
            );
        }
    }

    try {
        const job = await db.crawlJob.findUnique({
            where: { id: jobId },
        });

        if (!job) {
            return NextResponse.json(
                { error: 'Crawl job not found' },
                { status: 404 }
            );
        }

        // Parse discovered URLs if available
        let discoveredUrls: string[] = [];
        if (job.discoveredUrls) {
            discoveredUrls = safeParseJson<string[]>(job.discoveredUrls, []);
        }

        return NextResponse.json({
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
        });
    } catch (error) {
        console.error('Error fetching crawl job:', error);
        return NextResponse.json(
            { error: 'Failed to fetch crawl job' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/crawl?jobId=X - Cancel an active crawl job
 */
export async function DELETE(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json(
            { error: 'jobId is required' },
            { status: 400 }
        );
    }

    try {
        // Check if crawl is active and abort it
        const controller = activeCrawls.get(jobId);
        if (controller) {
            controller.abort();
            activeCrawls.delete(jobId);
        }

        // Update job status in database
        const job = await db.crawlJob.update({
            where: { id: jobId },
            data: {
                status: 'cancelled',
                completedAt: new Date(),
            },
        });

        return NextResponse.json({
            jobId: job.id,
            status: job.status,
            message: 'Crawl job cancelled',
        });
    } catch (error) {
        console.error('Error cancelling crawl job:', error);
        return NextResponse.json(
            { error: 'Failed to cancel crawl job' },
            { status: 500 }
        );
    }
}

/**
 * Start crawl processing in background
 */
async function startCrawlInBackground(
    jobId: string,
    sourceDomain: string,
    options: {
        maxPages: number;
        maxDepth: number;
        delayMs: number;
        includePatterns?: string[];
        excludePatterns?: string[];
        useOverrideToken?: boolean;
    }
) {
    const controller = new AbortController();
    activeCrawls.set(jobId, controller);

    try {
        await processCrawlJob(
            jobId,
            sourceDomain,
            { ...options, signal: controller.signal } as any,
            async (data) => {
                // Update database with progress
                const updateData: any = {
                    updatedAt: new Date(),
                };

                if (data.pagesVisited !== undefined) updateData.pagesVisited = data.pagesVisited;
                if (data.totalDiscovered !== undefined) updateData.totalDiscovered = data.totalDiscovered;
                if (data.status !== undefined) updateData.status = data.status;
                if (data.lastError !== undefined) updateData.lastError = data.lastError;
                if (data.errorCount !== undefined) updateData.errorCount = data.errorCount;
                if (data.discoveredUrls !== undefined) {
                    updateData.discoveredUrls = toJsonString(data.discoveredUrls);
                }
                if (data.status === 'completed' || data.status === 'failed') {
                    updateData.completedAt = new Date();
                }

                await db.crawlJob.update({
                    where: { id: jobId },
                    data: updateData,
                });
            }
        );
    } catch (error) {
        console.error(`Crawl job ${jobId} failed:`, error);

        // Update job as failed if not already cancelled
        try {
            const job = await db.crawlJob.findUnique({ where: { id: jobId } });
            if (job && job.status !== 'cancelled') {
                await db.crawlJob.update({
                    where: { id: jobId },
                    data: {
                        status: 'failed',
                        lastError: error instanceof Error ? error.message : String(error),
                        completedAt: new Date(),
                    },
                });
            }
        } catch {
            // Ignore update errors
        }
    } finally {
        activeCrawls.delete(jobId);
    }
}

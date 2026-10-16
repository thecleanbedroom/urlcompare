/**
 * One-shot legacy migration: CrawlJob → DiscoveryJob, and expands
 * CrawlJob.discoveredUrls JSON into UrlSet + DiscoveredUrl rows.
 *
 * Idempotent — safe to re-run (upserts everywhere, legacy ids kept).
 * Run: npx tsx scripts/migrate-legacy.ts
 * After verifying counts, drop the CrawlJob table via a follow-up
 * `prisma migrate` migration.
 */

import { db } from '../src/lib/db'
import { safeParseJson } from 'shared-logic'

async function main() {
    const legacy = await db.crawlJob.findMany({ orderBy: { createdAt: 'asc' } })
    console.log(`Found ${legacy.length} legacy crawl job(s)`)

    for (const job of legacy) {
        const discovery = await db.discoveryJob.upsert({
            where: { id: job.id },
            create: {
                id: job.id,
                name: job.name,
                sourceDomain: job.sourceDomain,
                // old 'crawling' state maps to 'running'
                status: job.status === 'crawling' ? 'running' : job.status,
                sources: JSON.stringify(['crawl']),
                maxPages: job.maxPages,
                maxDepth: Math.min(job.maxDepth, 1000),
                delayMs: job.delayMs,
                includePatterns: job.includePatterns,
                excludePatterns: job.excludePatterns,
                pagesVisited: job.pagesVisited,
                errorCount: job.errorCount,
                lastError: job.lastError,
                createdAt: job.createdAt,
                updatedAt: job.updatedAt,
                completedAt: job.completedAt,
            },
            update: {},
        })

        const urls = job.discoveredUrls
            ? safeParseJson<string[]>(job.discoveredUrls, [])
            : []

        let migrated = 0
        if (urls.length > 0) {
            const urlSet = await db.urlSet.upsert({
                where: { jobId: discovery.id },
                create: { jobId: discovery.id, name: job.name },
                update: {},
            })

            for (const url of urls) {
                await db.discoveredUrl.upsert({
                    where: { urlSetId_url: { urlSetId: urlSet.id, url } },
                    create: {
                        urlSetId: urlSet.id,
                        url,
                        sources: JSON.stringify(['crawl']),
                        included: true,
                    },
                    update: {},
                })
                migrated++
            }
        }

        console.log(`  ${job.id} "${job.name ?? job.sourceDomain}" → DiscoveryJob + ${migrated} urls`)
    }

    console.log('Done. Verify counts, then drop CrawlJob via a follow-up migration.')
}

main()
    .catch(err => {
        console.error('Migration failed:', err)
        process.exitCode = 1
    })
    .finally(() => db.$disconnect())

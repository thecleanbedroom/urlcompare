import { Hono } from 'hono'
import { db } from '../lib/db'
import { badRequest, notFound, serverError } from '../lib/http'
import { safeParseJson, generateSummary, toJsonExport, toCsvExport, toHtmlExport } from 'shared-logic'

export const exportRoute = new Hono()

exportRoute.get('/', async (c) => {
    try {
        const jobId = c.req.query('jobId')
        const format = c.req.query('format') || 'json'

        if (!jobId) return badRequest(c, 'jobId is required')

        const job = await db.comparisonJob.findUnique({
            where: { id: jobId },
            include: {
                urlResults: {
                    orderBy: { checkedAt: 'asc' }
                }
            }
        })
        if (!job) return notFound(c, 'Job not found')

        const results = job.urlResults.map(result => ({
            sourceUrl: result.sourceUrl,
            newUrl: result.newUrl,
            statusCode: result.statusCode,
            redirectChain: safeParseJson<string[]>(result.redirectChain, []),
            finalUrl: result.finalUrl,
            result: result.result,
            error: result.error,
            retryCount: result.retryCount,
            checkedAt: result.checkedAt
        }))

        const summary = generateSummary(results)
        const filename = `url-comparison-${job.id}`

        if (format === 'json') {
            return c.body(toJsonExport(job, summary, results), 200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${filename}.json"`
            })
        } else if (format === 'csv') {
            return c.body(toCsvExport(results), 200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}.csv"`
            })
        } else if (format === 'html') {
            return c.html(toHtmlExport(job, summary, results), 200, {
                'Content-Disposition': `attachment; filename="${filename}.html"`
            })
        }

        return badRequest(c, 'Unsupported format. Use json, csv, or html')
    } catch (error) {
        console.error('Error exporting results:', error)
        return serverError(c)
    }
})

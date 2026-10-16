import { Hono } from 'hono'
import { ComparisonRequestSchema } from 'shared-types'
import { isUrlSafe } from 'shared-logic'
import { badRequest, formatIssues, notFound, serverError } from '../lib/http'
import {
    cancelComparisonJob,
    createComparisonJob,
    getComparisonJob,
    listComparisonJobs,
} from '../services/comparison-service'

export const comparisonsRoute = new Hono()

comparisonsRoute.post('/', async (c) => {
    try {
        const body = await c.req.json()

        const parsed = ComparisonRequestSchema.safeParse(body)
        if (!parsed.success) {
            return badRequest(c, 'Validation failed', formatIssues(parsed.error))
        }

        const { sourceUrls, newDomain, config = {}, name } = parsed.data

        // SSRF protection — reject private/internal URLs
        const unsafeUrl = sourceUrls.find(url => !isUrlSafe(url).safe)
        if (unsafeUrl) {
            return badRequest(c, `URL blocked for security: ${unsafeUrl}`)
        }

        const domainCheck = isUrlSafe(newDomain.startsWith('http') ? newDomain : `https://${newDomain}`)
        if (!domainCheck.safe) {
            return badRequest(c, `New domain blocked for security: ${newDomain}`)
        }

        const job = await createComparisonJob({ sourceUrls, newDomain, config: config ?? {}, name })

        return c.json({
            jobId: job.id,
            message: 'Comparison job started',
            totalUrls: sourceUrls.length
        })
    } catch (error) {
        console.error('Error creating comparison job:', error)
        return serverError(c)
    }
})

comparisonsRoute.get('/', async (c) => {
    try {
        const jobId = c.req.query('jobId')

        if (jobId) {
            const data = await getComparisonJob(jobId)
            if (!data) return notFound(c, 'Job not found')
            return c.json(data)
        }

        const jobs = await listComparisonJobs()
        return c.json({ jobs })
    } catch (error) {
        console.error('Error fetching jobs:', error)
        return serverError(c)
    }
})

comparisonsRoute.delete('/', async (c) => {
    const jobId = c.req.query('jobId')
    if (!jobId) return badRequest(c, 'jobId is required')

    try {
        await cancelComparisonJob(jobId)
        return c.json({
            jobId,
            status: 'cancelled',
            message: 'Comparison job cancelled'
        })
    } catch (error) {
        console.error('Error cancelling comparison job:', error)
        return serverError(c, 'Failed to cancel comparison job')
    }
})

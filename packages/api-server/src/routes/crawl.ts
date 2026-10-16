import { Hono } from 'hono'
import { CrawlRequestSchema } from 'shared-types'
import { badRequest, formatIssues, notFound, serverError } from '../lib/http'
import { cancelCrawlJob, createCrawlJob, getCrawlJob, listCrawlJobs } from '../services/crawl-service'

export const crawlRoute = new Hono()

crawlRoute.post('/', async (c) => {
    try {
        const body = await c.req.json()

        const parsed = CrawlRequestSchema.safeParse(body)
        if (!parsed.success) {
            return badRequest(c, 'Validation failed', formatIssues(parsed.error))
        }

        const job = await createCrawlJob(parsed.data)

        return c.json({
            jobId: job.id,
            status: job.status,
            message: 'Crawl job started',
        })
    } catch (error) {
        console.error('Error starting crawl:', error)
        return serverError(c, 'Failed to start crawl job')
    }
})

crawlRoute.get('/', async (c) => {
    const jobId = c.req.query('jobId')

    if (!jobId) {
        try {
            const jobs = await listCrawlJobs()
            return c.json({ jobs })
        } catch (error) {
            console.error('Error fetching crawl jobs:', error)
            return serverError(c, 'Failed to fetch crawl jobs')
        }
    }

    try {
        const data = await getCrawlJob(jobId)
        if (!data) return notFound(c, 'Crawl job not found')
        return c.json(data)
    } catch (error) {
        console.error('Error fetching crawl job:', error)
        return serverError(c, 'Failed to fetch crawl job')
    }
})

crawlRoute.delete('/', async (c) => {
    const jobId = c.req.query('jobId')
    if (!jobId) return badRequest(c, 'jobId is required')

    try {
        const job = await cancelCrawlJob(jobId)
        return c.json({
            jobId: job.id,
            status: job.status,
            message: 'Crawl job cancelled',
        })
    } catch (error) {
        console.error('Error cancelling crawl job:', error)
        return serverError(c, 'Failed to cancel crawl job')
    }
})

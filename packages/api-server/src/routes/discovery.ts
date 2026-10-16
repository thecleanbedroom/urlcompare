import { Hono } from 'hono'
import { StartDiscoveryRequestSchema } from 'shared-types'
import { badRequest, formatIssues, notFound, serverError } from '../lib/http'
import {
    cancelDiscoveryJob,
    checkDiscoverySources,
    createDiscoveryJob,
    deleteDiscoveryJob,
    getDiscoveryJob,
    listDiscoveryJobs,
} from '../services/discovery-service'
import { GscNotConnectedError } from '../services/google-auth-service'

export const discoveryRoute = new Hono()

discoveryRoute.post('/', async (c) => {
    try {
        const body = await c.req.json()

        const parsed = StartDiscoveryRequestSchema.safeParse(body)
        if (!parsed.success) {
            return badRequest(c, 'Validation failed', formatIssues(parsed.error))
        }

        try {
            await checkDiscoverySources(parsed.data.sources)
        } catch (error) {
            if (error instanceof GscNotConnectedError) {
                return c.json({ error: error.code, message: error.message, hint: error.hint }, 400)
            }
            throw error
        }

        const job = await createDiscoveryJob(parsed.data)

        return c.json({
            jobId: job.id,
            status: job.status,
            message: 'Discovery job started',
        })
    } catch (error) {
        console.error('Error starting discovery:', error)
        return serverError(c, 'Failed to start discovery job')
    }
})

discoveryRoute.get('/', async (c) => {
    try {
        const limit = Number(c.req.query('limit') ?? 50)
        const offset = Number(c.req.query('offset') ?? 0)
        return c.json(await listDiscoveryJobs(limit, offset))
    } catch (error) {
        console.error('Error fetching discovery jobs:', error)
        return serverError(c, 'Failed to fetch discovery jobs')
    }
})

discoveryRoute.get('/:id', async (c) => {
    try {
        const job = await getDiscoveryJob(c.req.param('id'))
        if (!job) return notFound(c, 'Discovery job not found')
        return c.json(job)
    } catch (error) {
        console.error('Error fetching discovery job:', error)
        return serverError(c, 'Failed to fetch discovery job')
    }
})

discoveryRoute.delete('/:id', async (c) => {
    const id = c.req.param('id')
    try {
        const job = await getDiscoveryJob(id)
        if (!job) return notFound(c, 'Discovery job not found')

        if (job.status === 'running' || job.status === 'pending') {
            const updated = await cancelDiscoveryJob(id)
            return c.json({ jobId: updated.id, status: updated.status, message: 'Discovery job cancelled' })
        }

        await deleteDiscoveryJob(id)
        return c.body(null, 204)
    } catch (error) {
        console.error('Error deleting discovery job:', error)
        return serverError(c, 'Failed to delete discovery job')
    }
})

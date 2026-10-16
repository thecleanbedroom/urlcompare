import { Hono } from 'hono'
import { db } from '../lib/db'
import { notFound, serverError } from '../lib/http'
import { deleteComparisonJob } from '../services/comparison-service'

export const jobsRoute = new Hono()

jobsRoute.get('/', async (c) => {
    try {
        const jobs = await db.comparisonJob.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { urlResults: true }
                },
                urlResults: {
                    select: { result: true },
                    take: 1
                }
            }
        })

        return c.json(jobs)
    } catch (error) {
        console.error('Error fetching jobs:', error)
        return serverError(c, 'Failed to fetch jobs')
    }
})

jobsRoute.delete('/:id', async (c) => {
    const id = c.req.param('id')

    try {
        const job = await db.comparisonJob.findUnique({ where: { id } })
        if (!job) return notFound(c, 'Job not found')

        await deleteComparisonJob(id)
        return c.body(null, 204)
    } catch (error) {
        console.error('Error deleting job:', error)
        return serverError(c, 'Failed to delete job')
    }
})

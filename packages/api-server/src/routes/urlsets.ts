import { Hono } from 'hono'
import { PatchUrlSetRequestSchema } from 'shared-types'
import { badRequest, formatIssues, notFound, serverError } from '../lib/http'
import { getUrlSet, listUrlSets, patchUrlSet } from '../services/urlset-service'

export const urlsetsRoute = new Hono()

urlsetsRoute.get('/', async (c) => {
    try {
        const limit = Number(c.req.query('limit') ?? 50)
        const offset = Number(c.req.query('offset') ?? 0)
        return c.json(await listUrlSets(limit, offset))
    } catch (error) {
        console.error('Error fetching url sets:', error)
        return serverError(c, 'Failed to fetch url sets')
    }
})

urlsetsRoute.get('/:id', async (c) => {
    try {
        const limit = Number(c.req.query('limit') ?? 500)
        const offset = Number(c.req.query('offset') ?? 0)
        const data = await getUrlSet(c.req.param('id'), limit, offset)
        if (!data) return notFound(c, 'URL set not found')
        return c.json(data)
    } catch (error) {
        console.error('Error fetching url set:', error)
        return serverError(c, 'Failed to fetch url set')
    }
})

urlsetsRoute.patch('/:id', async (c) => {
    try {
        const body = await c.req.json()
        const parsed = PatchUrlSetRequestSchema.safeParse(body)
        if (!parsed.success) {
            return badRequest(c, 'Validation failed', formatIssues(parsed.error))
        }

        const data = await patchUrlSet(c.req.param('id'), parsed.data)
        if (!data) return notFound(c, 'URL set not found')
        return c.json(data)
    } catch (error) {
        console.error('Error updating url set:', error)
        return serverError(c, 'Failed to update url set')
    }
})

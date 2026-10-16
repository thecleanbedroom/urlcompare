import { createMiddleware } from 'hono/factory'
import { config } from '../config'

/**
 * Bearer-token guard. Applied to all routes except GET /health
 * when API_KEY is configured — the API is private by default
 * (bound to loopback / the compose network), but if it's exposed
 * beyond the web proxy, callers must authenticate.
 */
export const apiKeyAuth = createMiddleware(async (c, next) => {
    if (!config.apiKey) return next()
    const header = c.req.header('authorization')
    if (header === `Bearer ${config.apiKey}`) return next()
    return c.json({ error: 'Unauthorized' }, 401)
})

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config'
import { apiKeyAuth } from './lib/auth'
import { comparisonsRoute } from './routes/comparisons'
import { discoveryRoute } from './routes/discovery'
import { exportRoute } from './routes/export'
import { googleAuthRoute } from './routes/google-auth'
import { jobsRoute } from './routes/jobs'
import { urlsetsRoute } from './routes/urlsets'
import { verifyRoute } from './routes/verify'

export const app = new Hono()

app.use('*', cors({
    origin: config.allowedOrigins,
    allowHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'MCP-Protocol-Version'],
}))

app.onError((err, c) => {
    console.error('Unhandled error:', err)
    return c.json({ error: 'Internal server error' }, 500)
})

app.notFound(c => c.json({ error: 'Not found' }, 404))

// Liveness — always unauthenticated
app.get('/health', c => c.json({ status: 'ok' }))
app.get('/api/health', c => c.json({ message: 'Good!' }))

app.use('/api/*', apiKeyAuth)

app.route('/api/comparison', comparisonsRoute)
app.route('/api/discovery', discoveryRoute)
app.route('/api/urlsets', urlsetsRoute)
app.route('/api/jobs', jobsRoute)
app.route('/api/verify', verifyRoute)
app.route('/api/export', exportRoute)
app.route('/api/auth/google', googleAuthRoute)

if (!process.env.VITEST) {
    serve({
        fetch: app.fetch,
        port: config.port,
        hostname: config.host,
    }, info => {
        console.log(`> api-server ready on http://${info.address}:${info.port}`)
    })
}

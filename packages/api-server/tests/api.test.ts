import { describe, it, expect } from 'vitest'
import { app } from '../src/server'

describe('api-server', () => {
    it('GET /health returns ok', async () => {
        const res = await app.request('/health')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ status: 'ok' })
    })

    it('GET /api/health returns message', async () => {
        const res = await app.request('/api/health')
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ message: 'Good!' })
    })

    it('POST /api/comparison rejects invalid body', async () => {
        const res = await app.request('/api/comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
        expect(res.status).toBe(400)
        const json = await res.json() as { error: string }
        expect(json.error).toBe('Validation failed')
    })

    it('POST /api/comparison blocks SSRF to private IPs', async () => {
        const res = await app.request('/api/comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sourceUrls: ['http://192.168.1.1/admin'],
                newDomain: 'https://example.com',
            }),
        })
        expect(res.status).toBe(400)
        const json = await res.json() as { error: string }
        expect(json.error).toContain('blocked')
    })

    it('GET /api/comparison?jobId=unknown returns 404', async () => {
        const res = await app.request('/api/comparison?jobId=does-not-exist')
        expect(res.status).toBe(404)
    })

    it('GET /api/export without jobId returns 400', async () => {
        const res = await app.request('/api/export')
        expect(res.status).toBe(400)
    })
})

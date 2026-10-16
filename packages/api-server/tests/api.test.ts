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

    it('POST /api/discovery rejects empty sources', async () => {
        const res = await app.request('/api/discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceDomain: 'https://example.com', sources: [] }),
        })
        expect(res.status).toBe(400)
        const json = await res.json() as { error: string }
        expect(json.error).toBe('Validation failed')
    })

    it('POST /api/discovery with gsc source returns gsc_not_connected', async () => {
        const res = await app.request('/api/discovery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceDomain: 'https://example.com', sources: ['gsc'] }),
        })
        expect(res.status).toBe(400)
        const json = await res.json() as { error: string; hint: string }
        expect(json.error).toBe('gsc_not_connected')
        expect(json.hint).toBeDefined()
    })

    it('GET /api/urlsets lists with pagination fields', async () => {
        const res = await app.request('/api/urlsets')
        expect(res.status).toBe(200)
        const json = await res.json() as { total: number; urlSets: unknown[] }
        expect(json.total).toBeTypeOf('number')
        expect(Array.isArray(json.urlSets)).toBe(true)
    })

    it('GET /api/urlsets/:id returns 404 for unknown set', async () => {
        const res = await app.request('/api/urlsets/nope')
        expect(res.status).toBe(404)
    })

    it('GET /api/auth/google/status reports disconnected', async () => {
        const res = await app.request('/api/auth/google/status')
        expect(res.status).toBe(200)
        const json = await res.json() as { connected: boolean }
        expect(json.connected).toBe(false)
    })

    it('POST /api/comparison rejects urlSetId+sourceUrls together', async () => {
        const res = await app.request('/api/comparison', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urlSetId: 'x',
                sourceUrls: ['https://example.com/'],
                newDomain: 'https://example.com',
            }),
        })
        expect(res.status).toBe(400)
    })
})

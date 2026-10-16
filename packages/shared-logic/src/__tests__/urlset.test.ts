import { describe, it, expect } from 'vitest'
import { mergeUrlSources } from '../urlset'
import { toJsonExport, toCsvExport, toHtmlExport } from '../export'

describe('mergeUrlSources', () => {
    it('deduplicates and records all contributing sources', () => {
        const merged = mergeUrlSources([
            { source: 'crawl', urls: ['https://ex.com/a', 'https://ex.com/b'] },
            { source: 'sitemap', urls: ['https://ex.com/b', 'https://ex.com/c'] },
            { source: 'gsc', urls: ['https://ex.com/c'] },
        ])

        expect(merged.map(m => m.url)).toEqual([
            'https://ex.com/a', 'https://ex.com/b', 'https://ex.com/c',
        ])
        expect(merged[0].sources).toEqual(['crawl'])
        expect(merged[1].sources).toEqual(['crawl', 'sitemap'])
        expect(merged[2].sources).toEqual(['sitemap', 'gsc'])
    })

    it('handles empty input', () => {
        expect(mergeUrlSources([])).toEqual([])
        expect(mergeUrlSources([{ source: 'crawl', urls: [] }])).toEqual([])
    })
})

describe('export generators', () => {
    const job = { id: 'j1', name: 'Test <Job>', newDomain: 'https://new.com', createdAt: '2026-01-01', status: 'completed' }
    const summary = { totalUrls: 1, ok: 1, redirected: 0, missing: 0, error: 0 }
    const results = [{
        sourceUrl: 'https://old.com/<a>',
        newUrl: 'https://new.com/a',
        statusCode: 200,
        redirectChain: ['https://new.com/r1'],
        finalUrl: 'https://new.com/a',
        result: 'OK',
        error: null,
        retryCount: 0,
        checkedAt: '2026-01-01',
    }]

    it('toJsonExport produces parseable JSON with job/summary/results', () => {
        const parsed = JSON.parse(toJsonExport(job, summary, results))
        expect(parsed.job.id).toBe('j1')
        expect(parsed.summary.ok).toBe(1)
        expect(parsed.results).toHaveLength(1)
        expect(parsed.exportedAt).toBeDefined()
    })

    it('toCsvExport produces header + one row', () => {
        const lines = toCsvExport(results).split('\n')
        expect(lines).toHaveLength(2)
        expect(lines[0]).toContain('Source URL')
        expect(lines[1]).toContain('https://old.com/<a>')
    })

    it('toHtmlExport escapes HTML in user-controlled fields', () => {
        const html = toHtmlExport(job, summary, results)
        expect(html).not.toContain('<Job>')
        expect(html).toContain('Test &lt;Job&gt;')
        expect(html).toContain('https://old.com/&lt;a&gt;')
        expect(html).not.toContain('https://old.com/<a>')
    })
})

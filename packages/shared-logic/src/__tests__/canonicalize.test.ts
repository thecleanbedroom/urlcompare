import { describe, it, expect } from 'vitest'
import { canonicalizeUrl } from '../canonicalize'
import { applyQueryPolicy, normalizeQueryParams } from '../querystring'

function url(raw: string) { return new URL(raw) }

describe('applyQueryPolicy', () => {
    it('ignore strips the entire query string', () => {
        const u = url('https://ex.com/page?a=1&b=2')
        applyQueryPolicy(u, { policy: 'ignore' })
        expect(u.search).toBe('')
    })

    it('allow keeps only allow-listed keys', () => {
        const u = url('https://ex.com/page?a=1&b=2&c=3')
        applyQueryPolicy(u, { policy: 'allow', allowKeys: ['a', 'c'] })
        expect(u.searchParams.get('a')).toBe('1')
        expect(u.searchParams.get('b')).toBeNull()
        expect(u.searchParams.get('c')).toBe('3')
    })

    it('deny drops only deny-listed keys', () => {
        const u = url('https://ex.com/page?a=1&utm=x&b=2')
        applyQueryPolicy(u, { policy: 'deny', denyKeys: ['utm'] })
        expect(u.searchParams.get('a')).toBe('1')
        expect(u.searchParams.get('utm')).toBeNull()
        expect(u.searchParams.get('b')).toBe('2')
    })
})

describe('normalizeQueryParams', () => {
    it('sorts keys, lowercases keys, drops empty values', () => {
        const u = url('https://ex.com/?Z=1&Empty=&a=2')
        normalizeQueryParams(u)
        expect(u.searchParams.get('z')).toBe('1')
        expect(u.searchParams.get('a')).toBe('2')
        expect(u.searchParams.has('empty')).toBe(false)
    })
})

describe('canonicalizeUrl', () => {
    it('strips hash fragments when ignoreAnchors', () => {
        expect(canonicalizeUrl('https://example.com/page#section'))
            .toBe('https://example.com/page')
    })

    it('lowercases host and drops default ports', () => {
        expect(canonicalizeUrl('HTTPS://EXAMPLE.COM:443/page'))
            .toBe('https://example.com/page')
        expect(canonicalizeUrl('http://EXAMPLE.com:80/a'))
            .toBe('http://example.com/a')
    })

    it('keeps non-default ports', () => {
        expect(canonicalizeUrl('https://example.com:8443/a'))
            .toBe('https://example.com:8443/a')
    })

    it('strips trailing slash except root', () => {
        expect(canonicalizeUrl('https://example.com/page/'))
            .toBe('https://example.com/page')
        expect(canonicalizeUrl('https://example.com/'))
            .toBe('https://example.com/')
    })

    it('default ignore policy strips query strings', () => {
        expect(canonicalizeUrl('https://example.com/page?utm=x&id=5'))
            .toBe('https://example.com/page')
    })

    it('keep policy via deny-empty preserves normalized query', () => {
        expect(canonicalizeUrl('https://example.com/p?b=2&A=1', {
            queryPolicy: 'deny',
            queryDenyKeys: [],
        })).toBe('https://example.com/p?a=1&b=2')
    })

    it('allow policy keeps only listed keys', () => {
        expect(canonicalizeUrl('https://example.com/p?a=1&b=2', {
            queryPolicy: 'allow',
            queryAllowKeys: ['a'],
        })).toBe('https://example.com/p?a=1')
    })

    it('returns raw string for unparseable input', () => {
        expect(canonicalizeUrl('not a url')).toBe('not a url')
    })
})

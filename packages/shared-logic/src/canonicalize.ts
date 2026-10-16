/**
 * URL canonicalization — the single canonical form used for all dedup:
 * crawler, sitemap, GSC merge, and DiscoveredUrl uniqueness.
 *
 * Rules: lowercase scheme + host, drop default ports, strip #fragment
 * (when ignoreAnchors), apply query policy, normalize query keys,
 * strip trailing slash (except root).
 */

import type { QueryStringPolicy } from 'shared-types'
import { applyQueryPolicy, normalizeQueryParams } from './querystring'

export interface CanonicalizeConfig {
    queryPolicy?: QueryStringPolicy
    queryAllowKeys?: string[]
    queryDenyKeys?: string[]
    normalizeQuery?: boolean
    ignoreAnchors?: boolean
}

export function canonicalizeUrl(raw: string, config: CanonicalizeConfig = {}): string {
    const {
        queryPolicy = 'ignore',
        queryAllowKeys = [],
        queryDenyKeys = [],
        normalizeQuery = true,
        ignoreAnchors = true,
    } = config

    try {
        const url = new URL(raw)

        url.protocol = url.protocol.toLowerCase()
        url.hostname = url.hostname.toLowerCase()

        if ((url.protocol === 'https:' && url.port === '443') ||
            (url.protocol === 'http:' && url.port === '80')) {
            url.port = ''
        }

        if (ignoreAnchors) url.hash = ''

        applyQueryPolicy(url, {
            policy: queryPolicy,
            allowKeys: queryAllowKeys,
            denyKeys: queryDenyKeys,
        })

        if (normalizeQuery) normalizeQueryParams(url)

        if (url.pathname !== '/' && url.pathname.endsWith('/')) {
            url.pathname = url.pathname.slice(0, -1)
        }

        return url.href
    } catch {
        return raw
    }
}

/**
 * Query-string policy and normalization helpers.
 *
 * Semantics:
 * - policy 'ignore': strip the entire query string.
 * - policy 'allow': keep only keys in allowKeys (case-sensitive match); drop all others.
 * - policy 'deny': drop keys in denyKeys; keep all others.
 * - normalize: sort keys, lowercase keys, drop empty values, consistent %-encoding.
 */

import type { QueryStringPolicy } from 'shared-types'

export interface QueryStringConfig {
    policy?: QueryStringPolicy
    allowKeys?: string[]
    denyKeys?: string[]
    normalize?: boolean
}

export function applyQueryPolicy(url: URL, config: QueryStringConfig = {}): URL {
    const { policy = 'ignore', allowKeys = [], denyKeys = [] } = config

    if (policy === 'ignore') {
        url.search = ''
        return url
    }

    if (policy === 'allow') {
        const allowed = new Set(allowKeys)
        for (const key of [...url.searchParams.keys()]) {
            if (!allowed.has(key)) url.searchParams.delete(key)
        }
    } else {
        for (const key of denyKeys) {
            url.searchParams.delete(key)
        }
    }

    return url
}

export function normalizeQueryParams(url: URL): void {
    if (!url.search) return
    const entries = [...url.searchParams.entries()]
        .filter(([key, value]) => key !== '' && value !== '')
        .map(([key, value]) => [key.toLowerCase(), value] as [string, string])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    url.search = new URLSearchParams(entries).toString()
}

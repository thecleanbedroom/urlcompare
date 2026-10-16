/**
 * UrlSet merging — combines canonicalized URL lists from multiple
 * sources into one deduplicated set, recording every contributing
 * source per URL.
 */

import type { DiscoverySource } from 'shared-types'

export interface UrlSourceList {
    source: DiscoverySource
    urls: string[]
}

export interface MergedUrl {
    url: string
    sources: DiscoverySource[]
}

const SOURCE_ORDER: DiscoverySource[] = ['crawl', 'sitemap', 'gsc', 'manual']

export function mergeUrlSources(lists: UrlSourceList[]): MergedUrl[] {
    const byUrl = new Map<string, Set<DiscoverySource>>()

    for (const { source, urls } of lists) {
        for (const url of urls) {
            let set = byUrl.get(url)
            if (!set) {
                set = new Set()
                byUrl.set(url, set)
            }
            set.add(source)
        }
    }

    return [...byUrl.entries()]
        .map(([url, sources]) => ({
            url,
            sources: SOURCE_ORDER.filter(s => sources.has(s)),
        }))
        .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
}

/**
 * Sitemap discovery and collection.
 *
 * Fetches sitemap.xml documents (plain and .xml.gz), follows sitemap
 * indexes with depth/count/URL limits, and applies isUrlSafe to every
 * fetched URL. Discovery via robots.txt falls back to /sitemap.xml.
 */

import { XMLParser } from 'fast-xml-parser'
import { gunzipSync } from 'node:zlib'
import { isUrlSafe } from './url-checker'

export interface SitemapOptions {
    maxIndexDepth?: number      // default 3
    maxChildSitemaps?: number   // default 50
    maxUrlsPerSitemap?: number  // default 50000
    timeoutMs?: number          // default 30000
    fetchImpl?: typeof fetch
    signal?: AbortSignal
    onWarning?: (warning: string) => void
}

export interface SitemapResult {
    urls: string[]
    sitemapsVisited: number
    warnings: string[]
}

const xmlParser = new XMLParser({ ignoreAttributes: true })

async function fetchText(
    url: string,
    timeoutMs: number,
    fetchImpl: typeof fetch,
    signal?: AbortSignal
): Promise<string> {
    const urlCheck = isUrlSafe(url)
    if (!urlCheck.safe) {
        throw new Error(`URL blocked: ${urlCheck.reason}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
        const response = await fetchImpl(url, { signal: combined, redirect: 'follow' })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const buffer = Buffer.from(await response.arrayBuffer())
        const looksGzip = url.endsWith('.gz') || (buffer[0] === 0x1f && buffer[1] === 0x8b)
        return looksGzip ? gunzipSync(buffer).toString('utf-8') : buffer.toString('utf-8')
    } finally {
        clearTimeout(timeoutId)
    }
}

function parseSitemapXml(xml: string): { childSitemaps: string[]; urls: string[] } {
    const doc = xmlParser.parse(xml)
    const urls: string[] = []
    const childSitemaps: string[] = []

    const urlset = doc?.urlset?.url
    if (urlset) {
        const entries = Array.isArray(urlset) ? urlset : [urlset]
        for (const entry of entries) {
            if (entry?.loc) urls.push(String(entry.loc))
        }
    }

    const index = doc?.sitemapindex?.sitemap
    if (index) {
        const entries = Array.isArray(index) ? index : [index]
        for (const entry of entries) {
            if (entry?.loc) childSitemaps.push(String(entry.loc))
        }
    }

    return { childSitemaps, urls }
}

/**
 * Find sitemap locations for a domain: robots.txt Sitemap: lines,
 * falling back to /sitemap.xml.
 */
export async function discoverSitemaps(
    domain: string,
    fetchImpl: typeof fetch = fetch,
    timeoutMs = 30000
): Promise<string[]> {
    const origin = new URL(domain).origin

    try {
        const text = await fetchText(`${origin}/robots.txt`, timeoutMs, fetchImpl)
        const maps = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.toLowerCase().startsWith('sitemap:'))
            .map(line => line.slice(8).trim())
            .filter(Boolean)
        if (maps.length > 0) return maps
    } catch {
        // robots.txt missing/unreachable — fall back to the default location
    }

    return [`${origin}/sitemap.xml`]
}

/**
 * Collect all URLs from a set of seed sitemaps, following sitemap
 * indexes up to maxIndexDepth.
 */
export async function collectSitemapUrls(
    seeds: string[],
    options: SitemapOptions = {}
): Promise<SitemapResult> {
    const {
        maxIndexDepth = 3,
        maxChildSitemaps = 50,
        maxUrlsPerSitemap = 50000,
        timeoutMs = 30000,
        fetchImpl = fetch,
        signal,
        onWarning,
    } = options

    const warnings: string[] = []
    const warn = (message: string) => {
        warnings.push(message)
        onWarning?.(message)
    }

    const urls = new Set<string>()
    const visited = new Set<string>()
    const queue = seeds.map(url => ({ url, depth: 0 }))
    let sitemapsVisited = 0
    let childSitemapsSeen = 0

    while (queue.length > 0) {
        if (signal?.aborted) break

        const item = queue.shift()!
        if (visited.has(item.url)) continue
        visited.add(item.url)

        if (item.depth > maxIndexDepth) {
            warn(`Max sitemap index depth ${maxIndexDepth} exceeded: ${item.url}`)
            continue
        }

        try {
            const xml = await fetchText(item.url, timeoutMs, fetchImpl, signal)
            sitemapsVisited++

            const { childSitemaps, urls: found } = parseSitemapXml(xml)

            const capped = found.slice(0, maxUrlsPerSitemap)
            if (found.length > maxUrlsPerSitemap) {
                warn(`Sitemap ${item.url} has ${found.length} URLs; capped at ${maxUrlsPerSitemap}`)
            }
            for (const url of capped) urls.add(url)

            for (const child of childSitemaps) {
                if (childSitemapsSeen >= maxChildSitemaps) {
                    warn(`Child sitemap cap ${maxChildSitemaps} reached; skipping ${child}`)
                    break
                }
                childSitemapsSeen++
                queue.push({ url: child, depth: item.depth + 1 })
            }
        } catch (error) {
            warn(`Failed to fetch sitemap ${item.url}: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    return { urls: [...urls], sitemapsVisited, warnings }
}

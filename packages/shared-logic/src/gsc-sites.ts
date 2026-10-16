/**
 * GSC site listing — picks the Search Console property that covers
 * a given source domain (sc-domain: host > URL-prefix match).
 */

const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3'

export async function listGscSites(
    accessToken: string,
    fetchImpl: typeof fetch = fetch
): Promise<string[]> {
    const response = await fetchImpl(`${GSC_API_BASE}/sites`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`GSC sites.list failed: HTTP ${response.status} ${detail.slice(0, 200)}`)
    }
    const data = await response.json() as { siteEntry?: Array<{ siteUrl: string }> }
    return (data.siteEntry ?? []).map(e => e.siteUrl)
}

/**
 * Resolve which Search Console property covers `domain`.
 * Prefers sc-domain: properties, then the longest URL-prefix match.
 * Returns null when the account has no covering property.
 */
export function resolveGscSite(domain: string, sites: string[]): string | null {
    const hostname = new URL(domain).hostname

    const domainProp = `sc-domain:${hostname}`
    if (sites.includes(domainProp)) return domainProp

    // Any sc-domain: property covering this host (parent domains)
    const parent = sites
        .filter(s => s.startsWith('sc-domain:') && hostname.endsWith(s.slice('sc-domain:'.length)))
        .sort((a, b) => b.length - a.length)[0]
    if (parent) return parent

    // URL-prefix properties that are a prefix of the domain URL
    const normalized = domain.endsWith('/') ? domain : `${domain}/`
    const prefix = sites
        .filter(s => !s.startsWith('sc-domain:') && normalized.startsWith(s))
        .sort((a, b) => b.length - a.length)[0]
    return prefix ?? null
}

/**
 * Shared URL checking utilities
 * Used by both comparison and verify API routes
 */

export interface ComparisonResult {
    sourceUrl: string
    newUrl: string
    statusCode: number | null
    redirectChain: string[]
    finalUrl: string | null
    result: 'OK' | 'Missing' | 'Error' | 'Redirected'
    error?: string
    retryCount: number
    checkedAt: string
}

export interface CheckUrlConfig {
    followRedirects?: boolean
    retryAttempts?: number
    timeoutSeconds?: number
    overrideToken?: string
    signal?: AbortSignal
}

/**
 * Check if a hostname resolves to a private/reserved IP address.
 * Blocks loopback, RFC 1918, link-local, and IPv6 loopback.
 */
export function isPrivateIPv4(hostname: string): boolean {
    // Block literal localhost
    if (hostname === 'localhost') return true

    // Block IPv6 loopback
    if (hostname === '[::1]' || hostname === '::1') return true

    // Strip brackets from IPv6 addresses
    const bare = hostname.replace(/^\[|\]$/g, '')

    // Parse as IPv4 octets
    const parts = bare.split('.')
    if (parts.length === 4) {
        const octets = parts.map(Number)

        // 127.x.x.x — loopback
        if (octets[0] === 127) return true

        // 10.x.x.x — RFC 1918 Class A
        if (octets[0] === 10) return true

        // 192.168.x.x — RFC 1918 Class C
        if (octets[0] === 192 && octets[1] === 168) return true

        // 172.16.0.0 – 172.31.255.255 — RFC 1918 Class B
        if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true

        // 169.254.x.x — link-local / AWS metadata
        if (octets[0] === 169 && octets[1] === 254) return true
    }

    return false
}

/**
 * Validate that a URL is safe to fetch (no SSRF).
 * Only allows HTTP/HTTPS and rejects private/internal IPs.
 */
export function isUrlSafe(url: string): { safe: boolean; reason?: string } {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return { safe: false, reason: 'Invalid URL' }
    }

    // Only allow http: and https: protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}` }
    }

    if (isPrivateIPv4(parsed.hostname)) {
        return { safe: false, reason: `Private/internal hostname blocked: ${parsed.hostname}` }
    }

    return { safe: true }
}

/**
 * Extract the path (pathname + search + hash) from a URL
 */
export function extractPath(url: string): string {
    try {
        const urlObj = new URL(url)
        return urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
        return '/'
    }
}

/**
 * Construct a new URL by combining a path with a domain
 */
export function constructNewUrl(path: string, domain: string): string {
    return domain.replace(/\/$/, '') + path
}

/**
 * Check the status of a URL on the new domain
 */
export async function checkUrlStatus(
    sourceUrl: string,
    newDomain: string,
    config: CheckUrlConfig = {}
): Promise<ComparisonResult> {
    const {
        followRedirects = true,
        retryAttempts = 3,
        timeoutSeconds = 10,
        overrideToken
    } = config

    let retryCount = 0
    let lastError: string | undefined

    while (retryCount < retryAttempts) {
        try {
            const path = extractPath(sourceUrl)
            const newUrl = constructNewUrl(path, newDomain)

            // SSRF protection — check before fetching
            const urlCheck = isUrlSafe(newUrl)
            if (!urlCheck.safe) {
                return {
                    sourceUrl,
                    newUrl,
                    statusCode: null,
                    redirectChain: [],
                    finalUrl: null,
                    result: 'Error',
                    error: `URL blocked: ${urlCheck.reason}`,
                    retryCount,
                    checkedAt: new Date().toISOString()
                }
            }

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

            const headers: Record<string, string> = {}
            if (overrideToken) {
                headers['X-EdgeRedirect-Override'] = overrideToken
            }

            const response = await fetch(newUrl, {
                method: 'GET',
                signal: controller.signal,
                redirect: followRedirects ? 'follow' : 'manual',
                headers
            })

            clearTimeout(timeoutId)

            const redirectChain: string[] = []
            let finalUrl = newUrl

            if (response.redirected) {
                const finalResponse = await fetch(newUrl, {
                    method: 'GET',
                    redirect: 'manual',
                    headers
                })

                if (finalResponse.status === 301 || finalResponse.status === 302 || finalResponse.status === 307 || finalResponse.status === 308) {
                    const location = finalResponse.headers.get('location')
                    if (location) {
                        redirectChain.push(location)
                        finalUrl = location
                    }
                }
            }

            let result: 'OK' | 'Missing' | 'Error' | 'Redirected' = 'OK'
            if (response.status === 404) result = 'Missing'
            if (response.status >= 400) result = 'Error'
            if (redirectChain.length > 0) result = 'Redirected'

            return {
                sourceUrl,
                newUrl,
                statusCode: response.status,
                redirectChain,
                finalUrl,
                result,
                retryCount,
                checkedAt: new Date().toISOString()
            }

        } catch (err) {
            retryCount++
            lastError = err instanceof Error ? err.message : 'Unknown error'

            if (retryCount >= retryAttempts) {
                const path = extractPath(sourceUrl)
                return {
                    sourceUrl,
                    newUrl: constructNewUrl(path, newDomain),
                    statusCode: null,
                    redirectChain: [],
                    finalUrl: null,
                    result: 'Error',
                    error: lastError,
                    retryCount,
                    checkedAt: new Date().toISOString()
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
    }

    const path = extractPath(sourceUrl)
    return {
        sourceUrl,
        newUrl: constructNewUrl(path, newDomain),
        statusCode: null,
        redirectChain: [],
        finalUrl: null,
        result: 'Error',
        error: lastError,
        retryCount,
        checkedAt: new Date().toISOString()
    }
}

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

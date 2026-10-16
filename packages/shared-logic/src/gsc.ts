/**
 * Google Search Console API client — pure, no OAuth, no env, no DB.
 * Takes an access token; refresh and credential storage live in
 * api-server's google-auth-service.
 *
 * Note: searchanalytics.query only returns pages that received
 * impressions in the date range — a GSC source is not exhaustive.
 */

const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3'

export interface GscOptions {
    accessToken: string
    /** Search Console property: "sc-domain:example.com" or "https://example.com/" */
    siteUrl: string
    /** YYYY-MM-DD; defaults to 16 months ago (GSC retention limit) */
    startDate?: string
    /** YYYY-MM-DD; defaults to today */
    endDate?: string
    /** Rows per request (max 50000); default 25000 */
    rowLimit?: number
    /** Total row cap; default 50000 */
    maxRows?: number
    fetchImpl?: typeof fetch
}

export interface GscResult {
    urls: string[]
    rowsFetched: number
    truncated: boolean
}

interface GscQueryResponse {
    rows?: Array<{ keys: string[] }>
}

function defaultStartDate(): string {
    const d = new Date()
    d.setMonth(d.getMonth() - 16)
    return d.toISOString().slice(0, 10)
}

export async function fetchGscPageUrls(options: GscOptions): Promise<GscResult> {
    const {
        accessToken,
        siteUrl,
        rowLimit = 25000,
        maxRows = 50000,
        fetchImpl = fetch,
    } = options

    const endDate = options.endDate ?? new Date().toISOString().slice(0, 10)
    const startDate = options.startDate ?? defaultStartDate()

    const urls: string[] = []
    let startRow = 0
    let truncated = false

    while (urls.length < maxRows) {
        const limit = Math.min(rowLimit, 50000)
        const response = await fetchImpl(
            `${GSC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    startDate,
                    endDate,
                    dimensions: ['page'],
                    rowLimit: limit,
                    startRow,
                }),
            }
        )

        if (!response.ok) {
            const detail = await response.text().catch(() => '')
            throw new Error(`GSC searchAnalytics query failed: HTTP ${response.status} ${detail.slice(0, 200)}`)
        }

        const data = await response.json() as GscQueryResponse
        const rows = data.rows ?? []
        if (rows.length === 0) break

        for (const row of rows) {
            if (urls.length >= maxRows) break
            const pageUrl = row.keys?.[0]
            if (pageUrl) urls.push(pageUrl)
        }

        if (rows.length < limit) break
        startRow += rows.length
        if (urls.length >= maxRows) truncated = true
    }

    return { urls, rowsFetched: urls.length, truncated }
}

/**
 * Domain Crawler - Discovers URLs by crawling a website
 * Uses BFS (breadth-first search) to traverse links
 */

export interface CrawlerOptions {
    maxPages: number;
    maxDepth: number;
    delayMs: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    onProgress?: (visited: number, discovered: number, currentUrl: string) => void;
    onError?: (url: string, error: Error) => void;
    signal?: AbortSignal;
}

export interface CrawlResult {
    discoveredUrls: string[];
    visitedCount: number;
    errorCount: number;
    errors: Array<{ url: string; error: string }>;
}

interface QueueItem {
    url: string;
    depth: number;
}

export class DomainCrawler {
    private sourceDomain: string;
    private options: CrawlerOptions;
    private visited: Set<string> = new Set();
    private discovered: Set<string> = new Set();
    private queue: QueueItem[] = [];
    private errors: Array<{ url: string; error: string }> = [];
    private baseDomain: string;
    private baseProtocol: string;

    constructor(sourceDomain: string, options: CrawlerOptions) {
        this.sourceDomain = this.normalizeUrl(sourceDomain);
        this.options = options;

        // Extract base domain for filtering internal links
        const url = new URL(this.sourceDomain);
        this.baseDomain = url.hostname;
        this.baseProtocol = url.protocol;
    }

    async crawl(): Promise<CrawlResult> {
        // Initialize with seed URL
        this.queue.push({ url: this.sourceDomain, depth: 0 });
        this.discovered.add(this.sourceDomain);

        while (this.queue.length > 0) {
            // Check for cancellation
            if (this.options.signal?.aborted) {
                break;
            }

            // Check page limit
            if (this.visited.size >= this.options.maxPages) {
                break;
            }

            const item = this.queue.shift()!;

            // Skip if already visited
            if (this.visited.has(item.url)) {
                continue;
            }

            // Skip if too deep
            if (item.depth > this.options.maxDepth) {
                continue;
            }

            try {
                // Fetch and process the page
                const html = await this.fetchPage(item.url);
                this.visited.add(item.url);

                // Extract and queue new links
                const links = this.extractLinks(html, item.url);
                for (const link of links) {
                    if (!this.discovered.has(link) && this.matchesPatterns(link)) {
                        this.discovered.add(link);
                        this.queue.push({ url: link, depth: item.depth + 1 });
                    }
                }

                // Report progress
                this.options.onProgress?.(
                    this.visited.size,
                    this.discovered.size,
                    item.url
                );

                // Delay before next request
                if (this.options.delayMs > 0 && this.queue.length > 0) {
                    await this.delay(this.options.delayMs);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.errors.push({ url: item.url, error: errorMessage });
                this.options.onError?.(item.url, error instanceof Error ? error : new Error(errorMessage));

                // Mark as visited to avoid retrying
                this.visited.add(item.url);
            }
        }

        return {
            discoveredUrls: Array.from(this.discovered),
            visitedCount: this.visited.size,
            errorCount: this.errors.length,
            errors: this.errors,
        };
    }

    private async fetchPage(url: string): Promise<string> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'URLCompare Domain Scanner/1.0',
                    'Accept': 'text/html,application/xhtml+xml',
                },
                redirect: 'follow',
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
                throw new Error(`Not HTML content: ${contentType}`);
            }

            return await response.text();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private extractLinks(html: string, baseUrl: string): string[] {
        const links: string[] = [];

        // Simple regex to extract href attributes from anchor tags
        const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;
        let match;

        while ((match = hrefRegex.exec(html)) !== null) {
            try {
                const href = match[1];

                // Skip non-HTTP links
                if (href.startsWith('javascript:') ||
                    href.startsWith('mailto:') ||
                    href.startsWith('tel:') ||
                    href.startsWith('#') ||
                    href.startsWith('data:')) {
                    continue;
                }

                // Resolve relative URLs
                const absoluteUrl = new URL(href, baseUrl);

                // Only include same-domain links
                if (absoluteUrl.hostname !== this.baseDomain) {
                    continue;
                }

                // Normalize and add
                const normalized = this.normalizeUrl(absoluteUrl.href);
                links.push(normalized);
            } catch {
                // Invalid URL, skip
            }
        }

        return links;
    }

    private matchesPatterns(url: string): boolean {
        const { includePatterns, excludePatterns } = this.options;

        // Check exclude patterns first
        if (excludePatterns && excludePatterns.length > 0) {
            for (const pattern of excludePatterns) {
                if (this.matchGlob(url, pattern)) {
                    return false;
                }
            }
        }

        // If include patterns specified, URL must match at least one
        if (includePatterns && includePatterns.length > 0) {
            for (const pattern of includePatterns) {
                if (this.matchGlob(url, pattern)) {
                    return true;
                }
            }
            return false;
        }

        return true;
    }

    private matchGlob(url: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars
            .replace(/\*/g, '.*')                   // * -> .*
            .replace(/\?/g, '.');                   // ? -> .

        const regex = new RegExp(regexPattern, 'i');
        return regex.test(url);
    }

    private normalizeUrl(url: string): string {
        try {
            const parsed = new URL(url);

            // Remove trailing slash from path (except for root)
            if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
                parsed.pathname = parsed.pathname.slice(0, -1);
            }

            // Remove default ports
            if ((parsed.protocol === 'https:' && parsed.port === '443') ||
                (parsed.protocol === 'http:' && parsed.port === '80')) {
                parsed.port = '';
            }

            // Remove hash
            parsed.hash = '';

            // Sort query parameters for consistency
            parsed.searchParams.sort();

            return parsed.href;
        } catch {
            return url;
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(resolve, ms);

            // Allow early exit on abort
            this.options.signal?.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                resolve();
            }, { once: true });
        });
    }
}

/**
 * Process a crawl job asynchronously
 * This function runs in the background and updates the database
 */
export async function processCrawlJob(
    jobId: string,
    sourceDomain: string,
    options: {
        maxPages: number;
        maxDepth: number;
        delayMs: number;
        includePatterns?: string[];
        excludePatterns?: string[];
    },
    updateProgress: (data: {
        pagesVisited?: number;
        totalDiscovered?: number;
        status?: string;
        discoveredUrls?: string[];
        lastError?: string;
        errorCount?: number;
    }) => Promise<void>
): Promise<CrawlResult> {
    const crawler = new DomainCrawler(sourceDomain, {
        ...options,
        onProgress: async (visited, discovered, currentUrl) => {
            // Update progress every 5 pages or on significant changes
            if (visited % 5 === 0 || visited === 1) {
                await updateProgress({
                    pagesVisited: visited,
                    totalDiscovered: discovered,
                });
            }
        },
        onError: async (url, error) => {
            console.error(`Crawl error for ${url}:`, error.message);
        },
    });

    try {
        await updateProgress({ status: 'crawling' });
        const result = await crawler.crawl();

        await updateProgress({
            status: 'completed',
            pagesVisited: result.visitedCount,
            totalDiscovered: result.discoveredUrls.length,
            discoveredUrls: result.discoveredUrls,
            errorCount: result.errorCount,
        });

        return result;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await updateProgress({
            status: 'failed',
            lastError: errorMessage,
        });
        throw error;
    }
}

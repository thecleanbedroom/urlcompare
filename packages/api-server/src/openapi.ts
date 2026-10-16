/**
 * Hand-written OpenAPI spec for the urlCompare API.
 * Served at /api/openapi.json and rendered by Scalar at /api/docs.
 * Keep in sync with src/routes/* — schemas mirror shared-types/schemas.ts.
 */

const ErrorResponse = {
    type: 'object',
    properties: {
        error: { type: 'string', example: 'invalid_input' },
        message: { type: 'string' },
        hint: { type: 'string' },
        details: { type: 'object' },
    },
    required: ['error'],
}

const JobStatus = { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }

const ComparisonConfig = {
    type: 'object',
    properties: {
        followRedirects: { type: 'boolean', default: true },
        maxConcurrency: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        retryAttempts: { type: 'integer', minimum: 0, maximum: 10, default: 3 },
        timeoutSeconds: { type: 'integer', minimum: 1, maximum: 60, default: 10 },
        useOverrideToken: { type: 'boolean' },
        edgeOverrideToken: { type: 'string' },
    },
}

const ComparisonResult = {
    type: 'object',
    properties: {
        sourceUrl: { type: 'string', format: 'uri' },
        newUrl: { type: 'string', format: 'uri' },
        statusCode: { type: 'integer', nullable: true },
        redirectChain: { type: 'array', items: { type: 'string' } },
        finalUrl: { type: 'string', nullable: true },
        result: { type: 'string', enum: ['OK', 'Redirected', 'Missing', 'Error'] },
        error: { type: 'string' },
        retryCount: { type: 'integer' },
        checkedAt: { type: 'string', format: 'date-time' },
    },
    required: ['sourceUrl', 'newUrl', 'result'],
}

const DiscoveryJob = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        name: { type: 'string', nullable: true },
        sourceDomain: { type: 'string', format: 'uri' },
        status: JobStatus,
        sources: { type: 'array', items: { type: 'string', enum: ['crawl', 'sitemap', 'gsc'] } },
        urlSetId: { type: 'string', nullable: true },
        urlCount: { type: 'integer' },
        pagesVisited: { type: 'integer' },
        errorCount: { type: 'integer' },
        lastError: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
    },
}

const ComparisonJob = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        name: { type: 'string', nullable: true },
        newDomain: { type: 'string' },
        status: JobStatus,
        totalUrls: { type: 'integer' },
        completedUrls: { type: 'integer' },
        urlSetId: { type: 'string', nullable: true },
        lastError: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: 'string', format: 'date-time', nullable: true },
    },
}

const DiscoveredUrl = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        sources: { type: 'array', items: { type: 'string', enum: ['crawl', 'sitemap', 'gsc', 'manual'] } },
        included: { type: 'boolean' },
    },
}

const UrlSet = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        name: { type: 'string', nullable: true },
        jobId: { type: 'string', nullable: true },
        sourceDomain: { type: 'string', nullable: true },
        urlCount: { type: 'integer' },
        createdAt: { type: 'string', format: 'date-time' },
    },
}

const JobSummary = {
    type: 'object',
    properties: {
        totalUrls: { type: 'integer' },
        ok: { type: 'integer' },
        redirected: { type: 'integer' },
        missing: { type: 'integer' },
        error: { type: 'integer' },
    },
}

const errorRef = { $ref: '#/components/schemas/ErrorResponse' }
const err = (description: string) => ({ description, content: { 'application/json': { schema: errorRef } } })

export const openApiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'urlCompare API',
        version: '1.0.0',
        license: { name: 'MIT' },
        description:
            'URL migration QA API: discover a site\'s URLs (crawl / sitemap / Google Search Console) into a URL set, ' +
            'review it, then compare every path against a new domain. All jobs are durable and asynchronous — POST to ' +
            'create, poll the job endpoint until status=completed. The MCP Streamable HTTP transport is mounted at POST /mcp.',
    },
    servers: [
        { url: 'https://urlcompare.backbaymedia.org', description: 'production (via web proxy)' },
        { url: 'http://localhost:3001', description: 'local dev' },
    ],
    // apiKey is optional — the {} alternative marks anonymous access allowed.
    security: [{ apiKey: [] }, {}],
    tags: [
        { name: 'Discovery', description: 'Multi-source URL discovery jobs' },
        { name: 'URL Sets', description: 'Reviewable, editable collections of discovered URLs' },
        { name: 'Comparison', description: 'Old-domain → new-domain verification jobs' },
        { name: 'Google Auth', description: 'Search Console OAuth2 connection' },
        { name: 'System', description: 'Health and MCP transport' },
    ],
    components: {
        schemas: {
            ErrorResponse,
            ComparisonConfig,
            ComparisonResult,
            DiscoveryJob,
            ComparisonJob,
            DiscoveredUrl,
            UrlSet,
            JobSummary,
        },
        securitySchemes: {
            apiKey: {
                type: 'http',
                scheme: 'bearer',
                description: 'API key — required on /api/* and /mcp when API_KEY is configured.',
            },
        },
    },
    paths: {
        '/api/health': {
            get: {
                tags: ['System'],
                operationId: 'health_check',
                summary: 'Liveness check',
                responses: { 200: { description: 'OK' } },
            },
        },
        '/mcp': {
            post: {
                tags: ['System'],
                operationId: 'mcp_endpoint',
                summary: 'MCP Streamable HTTP endpoint',
                description:
                    'JSON-RPC endpoint implementing the Model Context Protocol — initialize, tools/list, ' +
                    'tools/call, resources/list, resources/read. Stateless; each request is independent. ' +
                    'Tools: discover_urls, list_discovered_urls, update_url_set, start_comparison, ' +
                    'get_job_status, get_comparison_report, check_url, cancel_job, list_jobs.',
                requestBody: {
                    content: {
                        'application/json': {
                            schema: { type: 'object', description: 'JSON-RPC 2.0 envelope' },
                        },
                    },
                },
                responses: { 200: { description: 'JSON-RPC response' } },
            },
        },
        '/api/discovery': {
            post: {
                tags: ['Discovery'],
                operationId: 'start_discovery',
                summary: 'Start a discovery job',
                description:
                    'Runs the selected sources (link crawl, sitemap.xml, Search Console) and merges results ' +
                    'into a canonicalized, deduplicated URL set. GSC requires a connected Google account.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['sourceDomain'],
                                properties: {
                                    sourceDomain: { type: 'string', format: 'uri' },
                                    sources: {
                                        type: 'array',
                                        items: { type: 'string', enum: ['crawl', 'sitemap', 'gsc'] },
                                        default: ['crawl', 'sitemap'],
                                    },
                                    name: { type: 'string' },
                                    maxPages: { type: 'integer', default: 10000, maximum: 50000 },
                                    maxDepth: { type: 'integer', default: 20, maximum: 1000 },
                                    delayMs: { type: 'integer', default: 200 },
                                    includePatterns: { type: 'array', items: { type: 'string' } },
                                    excludePatterns: { type: 'array', items: { type: 'string' } },
                                    queryPolicy: { type: 'string', enum: ['ignore', 'allow', 'deny'], default: 'ignore' },
                                    queryAllowKeys: { type: 'array', items: { type: 'string' } },
                                    queryDenyKeys: { type: 'array', items: { type: 'string' } },
                                    normalizeQuery: { type: 'boolean', default: true },
                                    ignoreAnchors: { type: 'boolean', default: true },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Job created',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        jobId: { type: 'string' },
                                        status: JobStatus,
                                        message: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    400: err('invalid_input / url_blocked / gsc_not_connected / gsc_no_property'),
                },
            },
            get: {
                tags: ['Discovery'],
                operationId: 'list_discovery_jobs',
                summary: 'List discovery jobs',
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: {
                        description: 'Jobs, newest first',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        total: { type: 'integer' },
                                        jobs: { type: 'array', items: { $ref: '#/components/schemas/DiscoveryJob' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/discovery/{id}': {
            get: {
                tags: ['Discovery'],
                operationId: 'get_discovery_job',
                summary: 'Get a discovery job',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Job detail', content: { 'application/json': { schema: DiscoveryJob } } },
                    404: err('not_found'),
                },
            },
            delete: {
                tags: ['Discovery'],
                operationId: 'cancel_discovery_job',
                summary: 'Cancel a discovery job',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Cancelled' },
                    404: err('not_found'),
                },
            },
        },
        '/api/urlsets': {
            get: {
                tags: ['URL Sets'],
                operationId: 'list_url_sets',
                summary: 'List URL sets',
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: {
                        description: 'URL sets, newest first',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        total: { type: 'integer' },
                                        urlSets: { type: 'array', items: { $ref: '#/components/schemas/UrlSet' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/urlsets/{id}': {
            get: {
                tags: ['URL Sets'],
                operationId: 'get_url_set',
                summary: 'Get a URL set with its URLs',
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 500, maximum: 2000 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: {
                        description: 'Set detail + paginated URLs',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        urlSet: { $ref: '#/components/schemas/UrlSet' },
                                        total: { type: 'integer' },
                                        offset: { type: 'integer' },
                                        limit: { type: 'integer' },
                                        urls: { type: 'array', items: { $ref: '#/components/schemas/DiscoveredUrl' } },
                                    },
                                },
                            },
                        },
                    },
                    404: err('not_found'),
                },
            },
            patch: {
                tags: ['URL Sets'],
                operationId: 'update_url_set',
                summary: 'Edit a URL set',
                description: 'Toggle inclusion flags and/or add manual URLs (canonicalized, merged on collision).',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    included: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                urlId: { type: 'string' },
                                                included: { type: 'boolean' },
                                            },
                                            required: ['urlId', 'included'],
                                        },
                                    },
                                    addManualUrls: { type: 'array', items: { type: 'string', format: 'uri' } },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: { description: 'Updated set detail (same shape as GET)' },
                    400: err('invalid_input'),
                    404: err('not_found'),
                },
            },
        },
        '/api/comparison': {
            post: {
                tags: ['Comparison'],
                operationId: 'start_comparison',
                summary: 'Start a comparison job',
                description:
                    'Checks every source URL\'s path on the new domain. Exactly one of `urlSetId` (snapshots the ' +
                    'set\'s included URLs) or `sourceUrls` (ad-hoc list) is required.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['newDomain'],
                                properties: {
                                    urlSetId: { type: 'string' },
                                    sourceUrls: { type: 'array', items: { type: 'string', format: 'uri' } },
                                    newDomain: { type: 'string', format: 'uri' },
                                    name: { type: 'string' },
                                    config: { $ref: '#/components/schemas/ComparisonConfig' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Job created',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        jobId: { type: 'string' },
                                        totalUrls: { type: 'integer' },
                                        message: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    400: err('conflicting_params / url_blocked / no_included_urls'),
                    404: err('urlSetId not found'),
                },
            },
            get: {
                tags: ['Comparison'],
                operationId: 'get_comparison',
                summary: 'Get a comparison job + results',
                parameters: [{ name: 'jobId', in: 'query', required: true, schema: { type: 'string' } }],
                responses: {
                    200: {
                        description: 'Job, summary, and per-URL results',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        job: { $ref: '#/components/schemas/ComparisonJob' },
                                        summary: { $ref: '#/components/schemas/JobSummary' },
                                        results: { type: 'array', items: { $ref: '#/components/schemas/ComparisonResult' } },
                                    },
                                },
                            },
                        },
                    },
                    404: err('not_found'),
                },
            },
            delete: {
                tags: ['Comparison'],
                operationId: 'cancel_comparison',
                summary: 'Cancel a comparison job',
                parameters: [{ name: 'jobId', in: 'query', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Cancelled' },
                    404: err('not_found'),
                },
            },
        },
        '/api/jobs': {
            get: {
                tags: ['Comparison'],
                operationId: 'list_comparison_jobs',
                summary: 'List recent comparison jobs',
                responses: {
                    200: {
                        description: 'Comparison jobs, newest first',
                        content: {
                            'application/json': {
                                schema: { type: 'array', items: { $ref: '#/components/schemas/ComparisonJob' } },
                            },
                        },
                    },
                },
            },
        },
        '/api/verify': {
            post: {
                tags: ['Comparison'],
                operationId: 'verify_url',
                summary: 'Check a single URL (stateless or persisted)',
                description:
                    'Checks one source URL\'s path on the new domain synchronously. With `resultId`, re-verifies ' +
                    'and updates an existing comparison result row; without it, returns a fresh check only.',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['sourceUrl', 'newDomain'],
                                properties: {
                                    resultId: { type: 'string' },
                                    sourceUrl: { type: 'string', format: 'uri' },
                                    newDomain: { type: 'string', format: 'uri' },
                                    followRedirects: { type: 'boolean', default: true },
                                    useOverrideToken: { type: 'boolean' },
                                    edgeOverrideToken: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    200: {
                        description: 'Check result',
                        content: { 'application/json': { schema: { $ref: '#/components/schemas/ComparisonResult' } } },
                    },
                    400: err('invalid_input / url_blocked'),
                    404: err('resultId not found'),
                },
            },
        },
        '/api/export': {
            get: {
                tags: ['Comparison'],
                operationId: 'export_comparison',
                summary: 'Export a comparison job',
                parameters: [
                    { name: 'jobId', in: 'query', required: true, schema: { type: 'string' } },
                    { name: 'format', in: 'query', required: true, schema: { type: 'string', enum: ['json', 'csv', 'html'] } },
                ],
                responses: {
                    200: { description: 'File download (content-type varies by format)' },
                    400: err('invalid format'),
                    404: err('not_found'),
                },
            },
        },
        '/api/auth/google/start': {
            get: {
                tags: ['Google Auth'],
                operationId: 'google_auth_start',
                summary: 'Begin OAuth2 flow',
                description: '302-redirects to the Google consent screen. Browser flow — not an API call.',
                responses: { 302: { description: 'Redirect to Google' } },
            },
        },
        '/api/auth/google/callback': {
            get: {
                tags: ['Google Auth'],
                operationId: 'google_auth_callback',
                summary: 'OAuth2 callback',
                description: 'Google redirects here after consent; exchanges the code and stores credentials, then redirects to WEB_URL with ?gsc=connected|error.',
                parameters: [
                    { name: 'code', in: 'query', schema: { type: 'string' } },
                    { name: 'state', in: 'query', schema: { type: 'string' } },
                ],
                responses: { 302: { description: 'Redirect to web UI' } },
            },
        },
        '/api/auth/google/status': {
            get: {
                tags: ['Google Auth'],
                operationId: 'google_auth_status',
                summary: 'Connection status',
                responses: {
                    200: {
                        description: 'Whether Google is connected',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        connected: { type: 'boolean' },
                                        expiresAt: { type: 'string', format: 'date-time', nullable: true },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/api/auth/google/disconnect': {
            delete: {
                tags: ['Google Auth'],
                operationId: 'google_auth_disconnect',
                summary: 'Disconnect Google',
                responses: { 200: { description: 'Disconnected' } },
            },
        },
    },
} as const

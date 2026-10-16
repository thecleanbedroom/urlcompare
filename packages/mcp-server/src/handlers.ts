/**
 * Hand-written tool handlers — maps MCP tool arguments onto the
 * UrlCompareService surface and formats results/errors per the spec's
 * error contract. Kept separate from generated artifacts so spec
 * regeneration never touches business logic.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
    isServiceError,
    type JobKind,
    type ServiceError,
    type StartDiscoveryRequest,
    type UrlCompareService,
} from 'shared-types'

export type ToolCallResult = CallToolResult

function ok(data: unknown): ToolCallResult {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(e: unknown): ToolCallResult {
    const se: ServiceError = isServiceError(e)
        ? e
        : {
            code: 'internal_error',
            message: e instanceof Error ? e.message : String(e),
            hint: 'Retry once; if it persists, check the api-server logs.',
        }
    return {
        content: [{
            type: 'text',
            text: JSON.stringify({
                error: {
                    code: se.code,
                    message: se.message,
                    ...(se.hint ? { hint: se.hint } : {}),
                    ...(se.details !== undefined ? { details: se.details } : {}),
                },
            }, null, 2),
        }],
        isError: true,
    }
}

const str = (v: unknown): string | undefined =>
    v === undefined || v === null ? undefined : String(v)

const num = (v: unknown): number | undefined =>
    v === undefined || v === null ? undefined : Number(v)

const bool = (v: unknown): boolean | undefined =>
    v === undefined || v === null ? undefined : Boolean(v)

const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String) : undefined

const kind = (v: unknown): JobKind | undefined =>
    v === 'comparison' || v === 'discovery' ? v : undefined

export async function handleToolCall(
    service: UrlCompareService,
    name: string,
    args: Record<string, unknown>,
): Promise<ToolCallResult> {
    try {
        switch (name) {
            case 'discover_urls': {
                const result = await service.discoverUrls({
                    sourceDomain: String(args.sourceDomain),
                    sources: (strArr(args.sources) ?? ['crawl', 'sitemap']) as StartDiscoveryRequest['sources'],
                    name: str(args.name),
                    maxPages: num(args.maxPages),
                    maxDepth: num(args.maxDepth),
                    delayMs: num(args.delayMs),
                    includePatterns: strArr(args.includePatterns),
                    excludePatterns: strArr(args.excludePatterns),
                    queryPolicy: args.queryPolicy as StartDiscoveryRequest['queryPolicy'],
                    queryAllowKeys: strArr(args.queryAllowKeys),
                    queryDenyKeys: strArr(args.queryDenyKeys),
                    normalizeQuery: bool(args.normalizeQuery),
                    ignoreAnchors: bool(args.ignoreAnchors),
                })
                return ok({ job_id: result.jobId, status: result.status })
            }

            case 'list_discovered_urls': {
                const result = await service.listDiscoveredUrls(String(args.urlSetId), {
                    limit: num(args.limit),
                    offset: num(args.offset),
                })
                return ok(result)
            }

            case 'update_url_set': {
                const result = await service.updateUrlSet(String(args.urlSetId), {
                    included: Array.isArray(args.included)
                        ? (args.included as Array<{ urlId: string; included: boolean }>)
                        : undefined,
                    addManualUrls: strArr(args.addManualUrls),
                })
                return ok(result)
            }

            case 'start_comparison': {
                const result = await service.startComparison({
                    urlSetId: str(args.urlSetId),
                    sourceUrls: strArr(args.sourceUrls),
                    newDomain: String(args.newDomain),
                    name: str(args.name),
                    config: {
                        followRedirects: bool(args.followRedirects),
                        maxConcurrency: num(args.maxConcurrency),
                        retryAttempts: num(args.retryAttempts),
                        timeoutSeconds: num(args.timeoutSeconds),
                    },
                })
                return ok({ job_id: result.jobId, total_urls: result.totalUrls })
            }

            case 'get_job_status': {
                const result = await service.getJobStatus(String(args.jobId), kind(args.kind))
                return ok(result)
            }

            case 'get_comparison_report': {
                const result = await service.getComparisonReport(String(args.jobId), {
                    limit: num(args.limit),
                    offset: num(args.offset),
                })
                return ok(result)
            }

            case 'check_url': {
                const result = await service.checkUrl({
                    sourceUrl: String(args.sourceUrl),
                    newDomain: String(args.newDomain),
                    config: { followRedirects: bool(args.followRedirects) },
                })
                return ok({
                    result: result.result,
                    status_code: result.statusCode,
                    new_url: result.newUrl,
                    final_url: result.finalUrl,
                    redirect_chain: result.redirectChain,
                    error: result.error,
                })
            }

            case 'cancel_job': {
                const jobId = String(args.jobId)
                let jobKind = kind(args.kind)
                if (!jobKind) {
                    const status = await service.getJobStatus(jobId)
                    jobKind = status.kind
                }
                const result = await service.cancelJob(jobId, jobKind)
                return ok(result)
            }

            case 'list_jobs': {
                const result = await service.listJobs(kind(args.kind))
                return ok(result)
            }

            default:
                return err({
                    code: 'not_found',
                    message: `Unknown tool '${name}'`,
                    hint: 'Call tools/list to see the available tools.',
                })
        }
    } catch (e) {
        return err(e)
    }
}

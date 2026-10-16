import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { UrlCompareService } from 'shared-types'
import { handleToolCall } from './handlers'
import toolsJson from '../generated/urlcompare-mcp-tools.json'

const SERVER_INSTRUCTIONS: string = toolsJson.instructions
const TOOLS = toolsJson.tools

export function createMcpServer(service: UrlCompareService): Server {
    const server = new Server(
        { name: 'urlcompare', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {} }, instructions: SERVER_INSTRUCTIONS },
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params
        return handleToolCall(service, name, (args as Record<string, unknown>) || {})
    })

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
        resources: [
            {
                uri: 'urlcompare://urlsets',
                name: 'url-sets',
                description: 'All URL sets — discovered via discover_urls or created in the web UI — with url counts and source domains.',
                mimeType: 'application/json',
            },
            {
                uri: 'urlcompare://jobs',
                name: 'jobs',
                description: 'Recent discovery and comparison jobs with statuses — a read-only activity feed for finding job ids.',
                mimeType: 'application/json',
            },
        ],
    }))

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
        resourceTemplates: [
            {
                uriTemplate: 'urlcompare://urlsets/{url_set_id}',
                name: 'url-set',
                description: "The URLs in one set — canonicalized, with per-URL sources (crawl/sitemap/gsc/manual) and included flags.",
                mimeType: 'application/json',
            },
        ],
    }))

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const { uri } = request.params

        const respond = (data: unknown) => ({
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
        })

        if (uri === 'urlcompare://urlsets') {
            return respond(await service.listUrlSets({ limit: 100 }))
        }

        if (uri === 'urlcompare://jobs') {
            return respond(await service.listJobs())
        }

        if (uri.startsWith('urlcompare://urlsets/')) {
            const urlSetId = uri.slice('urlcompare://urlsets/'.length)
            return respond(await service.listDiscoveredUrls(urlSetId, { limit: 2000 }))
        }

        throw new Error(`Unknown resource: ${uri}`)
    })

    return server
}

/**
 * Handle one MCP request — creates a fresh Server + transport per call
 * (required by the stateless transport). Hono usage:
 *   app.all('/mcp', (c) => handleMcpRequest(service, c.req.raw))
 */
export async function handleMcpRequest(
    service: UrlCompareService,
    req: Request,
): Promise<Response> {
    const server = createMcpServer(service)

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless: no session tracking
        enableJsonResponse: true,
    })

    await server.connect(transport)
    return transport.handleRequest(req)
}

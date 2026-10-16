#!/usr/bin/env node
/**
 * stdio transport entry — runs the MCP server over stdin/stdout,
 * backed by HttpUrlCompareService against the REST API.
 *
 * Env:
 *   URLCOMPARE_API_URL  REST base (default http://localhost:3001)
 *   URLCOMPARE_API_KEY  Bearer token when the API requires it
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './index'
import { HttpUrlCompareService } from './http-client'

const service = new HttpUrlCompareService(
    process.env.URLCOMPARE_API_URL ?? 'http://localhost:3001',
    process.env.URLCOMPARE_API_KEY,
)

const server = createMcpServer(service)
const transport = new StdioServerTransport()

server.connect(transport).catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})

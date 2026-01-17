'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react'

interface UrlResult {
    id?: string
    sourceUrl: string
    newUrl: string
    statusCode: number | null
    redirectChain: string[]
    finalUrl: string | null
    result: 'OK' | 'Missing' | 'Error' | 'Redirected'
    error?: string
}

interface ResultCardProps {
    result: UrlResult
    onRetry: (result: UrlResult) => Promise<void>
    isRetrying: boolean
}

/**
 * Extract the path (pathname + search + hash) from a URL for display
 */
function extractPath(url: string): string {
    try {
        const urlObj = new URL(url)
        return urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
        return url
    }
}

/**
 * Get the appropriate status icon based on result
 */
function getStatusIcon(result: string) {
    switch (result) {
        case 'OK':
            return <CheckCircle className="h-4 w-4" />
        case 'Missing':
            return <XCircle className="h-4 w-4" />
        case 'Error':
            return <AlertCircle className="h-4 w-4" />
        case 'Redirected':
            return <AlertCircle className="h-4 w-4" />
        default:
            return <AlertCircle className="h-4 w-4" />
    }
}

/**
 * Get status badge with proper variant and label
 */
function getStatusBadge(result: string) {
    const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
        OK: 'success',
        Redirected: 'warning',
        Missing: 'destructive',
        Error: 'destructive'
    }

    const labels: Record<string, string> = {
        OK: 'OK',
        Redirected: 'Redirected',
        Missing: 'Not Found',
        Error: 'Not Found'
    }

    return (
        <Badge variant={variants[result] || 'secondary'} className="flex items-center gap-1">
            {getStatusIcon(result)}
            {labels[result] || result}
        </Badge>
    )
}

export function ResultCard({ result, onRetry, isRetrying }: ResultCardProps) {
    const isResolved = result.result === 'OK' || result.result === 'Redirected'
    const targetPath = extractPath(result.newUrl)

    return (
        <div className="border rounded-lg p-4 space-y-3">
            {/* Status line with badge and path */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {getStatusBadge(result.result)}
                    <span className="font-mono text-sm text-muted-foreground">{targetPath}</span>
                </div>
                {result.statusCode && (
                    <Badge variant="outline">{result.statusCode}</Badge>
                )}
            </div>

            {/* Source URL - full URL with domain, hyperlinked */}
            <div className="space-y-1">
                <div className="text-sm">
                    <span className="text-muted-foreground">Source: </span>
                    <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                        {result.sourceUrl}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                </div>

                {/* Target URL - full URL with domain */}
                <div className="text-sm">
                    <span className="text-muted-foreground">Target: </span>
                    {isResolved ? (
                        <a
                            href={result.newUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                            {result.newUrl}
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    ) : (
                        <span className="text-gray-400">{result.newUrl}</span>
                    )}
                </div>

                {/* Final URL if different from newUrl */}
                {result.finalUrl && result.finalUrl !== result.newUrl && (
                    <div className="text-sm">
                        <span className="text-muted-foreground">Final URL: </span>
                        <a
                            href={result.finalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                            {result.finalUrl}
                            <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                )}

                {/* Redirect chain if present */}
                {result.redirectChain && (() => {
                    try {
                        const chain = typeof result.redirectChain === 'string'
                            ? JSON.parse(result.redirectChain)
                            : result.redirectChain
                        return Array.isArray(chain) && chain.length > 0 ? (
                            <div className="text-sm text-muted-foreground">
                                Redirect Chain: {chain.join(' → ')}
                            </div>
                        ) : null
                    } catch {
                        return null
                    }
                })()}

                {/* Error message if present */}
                {result.error && (
                    <div className="text-sm text-red-600">
                        Error: {result.error}
                    </div>
                )}
            </div>

            {/* Retry button */}
            <div className="flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRetry(result)}
                    disabled={isRetrying}
                    className="flex items-center gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                    {isRetrying ? 'Retrying...' : 'Retry'}
                </Button>
            </div>
        </div>
    )
}

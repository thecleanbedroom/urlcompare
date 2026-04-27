'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Minimize2 } from 'lucide-react'
import { ResultCard } from '@/components/ResultCard'
import type { UrlResult, StatusFilter } from '@/types'

interface FullscreenResultsProps {
  results: UrlResult[]
  filteredResults: UrlResult[]
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  pathFilter: string
  setPathFilter: (v: string) => void
  onRetry: (result: UrlResult) => Promise<void>
  retryingIds: Set<string>
  onExport: (format: 'csv' | 'json') => void
  onExit: () => void
}

export function FullscreenResults({
  results, filteredResults,
  statusFilter, setStatusFilter,
  pathFilter, setPathFilter,
  onRetry, retryingIds,
  onExport, onExit,
}: FullscreenResultsProps) {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto p-4">
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Detailed results for each URL check
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('csv')} className="flex items-center gap-1">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('json')} className="flex items-center gap-1">
              <Download className="h-4 w-4" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={onExit} className="flex items-center gap-1">
              <Minimize2 className="h-4 w-4" /> Exit Fullscreen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>
              All ({results.length})
            </Button>
            <Button variant={statusFilter === 'ok' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('ok')}
              className={statusFilter === 'ok' ? 'bg-green-600 hover:bg-green-700' : ''}>
              OK ({results.filter(r => r.result === 'OK').length})
            </Button>
            <Button variant={statusFilter === 'redirected' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('redirected')}
              className={statusFilter === 'redirected' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}>
              Redirected ({results.filter(r => r.result === 'Redirected').length})
            </Button>
            <Button variant={statusFilter === 'not-found' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('not-found')}
              className={statusFilter === 'not-found' ? 'bg-red-600 hover:bg-red-700' : ''}>
              Not Found ({results.filter(r => r.result === 'Missing' || r.result === 'Error').length})
            </Button>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Filter by path... (e.g. 'bed' matches '/bedroom', '/beds')"
              value={pathFilter}
              onChange={(e) => setPathFilter(e.target.value)}
              className="max-w-md"
            />
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">
            {filteredResults.map((result, index) => (
              <ResultCard
                key={result.id || index}
                result={result}
                onRetry={onRetry}
                isRetrying={retryingIds.has(result.id || '')}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

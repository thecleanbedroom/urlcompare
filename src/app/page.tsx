'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ComparisonConfig } from '@/components/ComparisonConfig'
import { ResultsPanel } from '@/components/ResultsPanel'
import { FullscreenResults } from '@/components/FullscreenResults'
import { useComparison } from '@/hooks/useComparison'
import { useResultFilter } from '@/hooks/useResultFilter'

function HomeContent() {
  const searchParams = useSearchParams()
  const jobIdParam = searchParams.get('jobId')

  const comp = useComparison(jobIdParam)
  const filter = useResultFilter()
  const [isResultsExpanded, setIsResultsExpanded] = useState(false)

  const filteredResults = filter.filterResults(comp.results)

  const exportResults = (format: 'csv' | 'json') => {
    if (!comp.jobId || comp.results.length === 0) return
    window.open(`/api/export?jobId=${comp.jobId}&format=${format}`, '_blank')
  }

  if (isResultsExpanded && comp.results.length > 0) {
    return (
      <FullscreenResults
        results={comp.results}
        filteredResults={filteredResults}
        statusFilter={filter.statusFilter}
        setStatusFilter={filter.setStatusFilter}
        pathFilter={filter.pathFilter}
        setPathFilter={filter.setPathFilter}
        onRetry={comp.retryVerification}
        retryingIds={comp.retryingIds}
        onExport={exportResults}
        onExit={() => setIsResultsExpanded(false)}
      />
    )
  }

  return (
    <div className="min-h-screen h-screen bg-background">
      <div className="grid grid-cols-[1fr_2fr] h-full">
        <ComparisonConfig
          sourceUrls={comp.sourceUrls} setSourceUrls={comp.setSourceUrls}
          newDomain={comp.newDomain} setNewDomain={comp.setNewDomain}
          jobName={comp.jobName} setJobName={comp.setJobName}
          followRedirects={comp.followRedirects} setFollowRedirects={comp.setFollowRedirects}
          maxConcurrency={comp.maxConcurrency} setMaxConcurrency={comp.setMaxConcurrency}
          retryAttempts={comp.retryAttempts} setRetryAttempts={comp.setRetryAttempts}
          timeoutSeconds={comp.timeoutSeconds} setTimeoutSeconds={comp.setTimeoutSeconds}
          useOverrideToken={comp.useOverrideToken} setUseOverrideToken={comp.setUseOverrideToken}
          activeTab={comp.activeTab} setActiveTab={comp.setActiveTab}
          isRunning={comp.isRunning} error={comp.error}
          onRun={comp.runComparison} onCrawlComplete={comp.handleCrawlComplete}
        />

        <main className="h-full overflow-y-auto p-4 space-y-4">
          {comp.isRunning && (
            <Card>
              <CardContent className="py-8">
                <div className="space-y-4 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-lg font-medium">Comparing URLs...</p>
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{comp.progress}%</span>
                    </div>
                    <Progress value={comp.progress} />
                  </div>
                  <Button variant="destructive" size="sm" onClick={comp.cancelJob} className="mt-2">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!comp.isRunning && (
            <ResultsPanel
              summary={comp.summary}
              results={comp.results}
              filteredResults={filteredResults}
              statusFilter={filter.statusFilter}
              setStatusFilter={filter.setStatusFilter}
              pathFilter={filter.pathFilter}
              setPathFilter={filter.setPathFilter}
              onRetry={comp.retryVerification}
              retryingIds={comp.retryingIds}
              onExport={exportResults}
              onExpand={() => setIsResultsExpanded(true)}
            />
          )}

          {!comp.isRunning && !comp.summary && comp.results.length === 0 && (
            <Card className="flex-1 h-full">
              <CardContent className="h-full flex items-center justify-center">
                <EmptyState />
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}

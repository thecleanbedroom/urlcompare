'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { JobSummary } from '@/types'

interface SummaryCardProps {
  summary: JobSummary
}

export function SummaryCard({ summary }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{summary.totalUrls}</div>
            <div className="text-sm text-muted-foreground">Total URLs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{summary.ok}</div>
            <div className="text-sm text-muted-foreground">OK</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.redirected}</div>
            <div className="text-sm text-muted-foreground">Redirected</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.missing}</div>
            <div className="text-sm text-muted-foreground">Missing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{summary.error}</div>
            <div className="text-sm text-muted-foreground">Errors</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

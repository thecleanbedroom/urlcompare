import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { safeParseJson, generateSummary, toJsonExport, toCsvExport, toHtmlExport } from 'shared-logic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const format = searchParams.get('format') || 'json'

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    // Get job with results
    const job = await db.comparisonJob.findUnique({
      where: { id: jobId },
      include: {
        urlResults: {
          orderBy: { checkedAt: 'asc' }
        }
      }
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    const results = job.urlResults.map(result => ({
      sourceUrl: result.sourceUrl,
      newUrl: result.newUrl,
      statusCode: result.statusCode,
      redirectChain: safeParseJson<string[]>(result.redirectChain, []),
      finalUrl: result.finalUrl,
      result: result.result,
      error: result.error,
      retryCount: result.retryCount,
      checkedAt: result.checkedAt
    }))

    const summary = generateSummary(results)

    if (format === 'json') {
      return new NextResponse(toJsonExport(job, summary, results), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.json"`
        }
      })
    } else if (format === 'csv') {
      return new NextResponse(toCsvExport(results), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.csv"`
        }
      })
    } else if (format === 'html') {
      return new NextResponse(toHtmlExport(job, summary, results), {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.html"`
        }
      })
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use json, csv, or html' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Error exporting results:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

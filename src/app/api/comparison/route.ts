import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toJsonString } from '@/lib/json'
import {
  checkUrlStatus,
  extractPath,
  constructNewUrl,
  isUrlSafe,
  type ComparisonResult
} from '@/lib/urlChecker'

interface ComparisonRequest {
  sourceUrls: string[]
  newDomain: string
  config?: {
    followRedirects?: boolean
    maxConcurrency?: number
    retryAttempts?: number
    timeoutSeconds?: number
    useOverrideToken?: boolean
  }
  name?: string
}

// Store active comparison abort controllers for cancellation
const activeComparisons = new Map<string, AbortController>()

export async function POST(request: NextRequest) {
  try {
    const body: ComparisonRequest = await request.json()

    const {
      sourceUrls,
      newDomain,
      config = {},
      name
    } = body

    // Validate input
    if (!sourceUrls || !Array.isArray(sourceUrls) || sourceUrls.length === 0) {
      return NextResponse.json(
        { error: 'sourceUrls is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!newDomain || typeof newDomain !== 'string') {
      return NextResponse.json(
        { error: 'newDomain is required and must be a string' },
        { status: 400 }
      )
    }

    // Validate URLs
    const validUrls = sourceUrls.filter(url => {
      try {
        new URL(url)
        return true
      } catch {
        return false
      }
    })

    if (validUrls.length !== sourceUrls.length) {
      return NextResponse.json(
        { error: 'Some URLs are invalid' },
        { status: 400 }
      )
    }

    // SSRF protection — reject private/internal URLs
    const unsafeUrl = validUrls.find(url => !isUrlSafe(url).safe)
    if (unsafeUrl) {
      return NextResponse.json(
        { error: `URL blocked for security: ${unsafeUrl}` },
        { status: 400 }
      )
    }

    // Also validate the new domain
    const domainCheck = isUrlSafe(newDomain.startsWith('http') ? newDomain : `https://${newDomain}`)
    if (!domainCheck.safe) {
      return NextResponse.json(
        { error: `New domain blocked for security: ${newDomain}` },
        { status: 400 }
      )
    }

    // Create comparison job
    const job = await db.comparisonJob.create({
      data: {
        name: name || `Comparison ${new Date().toISOString()}`,
        sourceUrls: toJsonString(validUrls),
        newDomain,
        config: toJsonString(config),
        totalUrls: validUrls.length,
        status: 'pending'
      }
    })

    // Start processing in background
    processComparisonJob(job.id, validUrls, newDomain, config).catch(error => {
      console.error(`Error processing job ${job.id}:`, error)
    })

    return NextResponse.json({
      jobId: job.id,
      message: 'Comparison job started',
      totalUrls: validUrls.length
    })

  } catch (error) {
    console.error('Error creating comparison job:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (jobId) {
      // Get specific job with results
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

      return NextResponse.json({
        job,
        summary: generateSummary(job.urlResults),
        results: job.urlResults
      })
    } else {
      // Get all jobs
      const jobs = await db.comparisonJob.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          urlResults: true
        }
      })

      const jobsWithSummary = jobs.map(job => ({
        ...job,
        summary: generateSummary(job.urlResults)
      }))

      return NextResponse.json({ jobs: jobsWithSummary })
    }
  } catch (error) {
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/comparison?jobId=X - Cancel a running comparison job
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json(
      { error: 'jobId is required' },
      { status: 400 }
    )
  }

  try {
    // Abort the active comparison if running
    const controller = activeComparisons.get(jobId)
    if (controller) {
      controller.abort()
      activeComparisons.delete(jobId)
    }

    // Update job status in database
    await db.comparisonJob.update({
      where: { id: jobId },
      data: { status: 'cancelled' }
    })

    return NextResponse.json({
      jobId,
      status: 'cancelled',
      message: 'Comparison job cancelled'
    })
  } catch (error) {
    console.error('Error cancelling comparison job:', error)
    return NextResponse.json(
      { error: 'Failed to cancel comparison job' },
      { status: 500 }
    )
  }
}

async function processComparisonJob(
  jobId: string,
  sourceUrls: string[],
  newDomain: string,
  config: any
) {
  const {
    followRedirects = true,
    maxConcurrency = 10,
    retryAttempts = 3,
    timeoutSeconds = 10,
    useOverrideToken = false
  } = config

  const controller = new AbortController()
  activeComparisons.set(jobId, controller)

  try {
    // Update job status to running
    await db.comparisonJob.update({
      where: { id: jobId },
      data: { status: 'running' }
    })

    const results: ComparisonResult[] = []
    let completed = 0

    // Process URLs in batches
    for (let i = 0; i < sourceUrls.length; i += maxConcurrency) {
      // Check for cancellation between batches
      if (controller.signal.aborted) {
        break
      }

      const batch = sourceUrls.slice(i, i + maxConcurrency)

      const batchPromises = batch.map(async (sourceUrl) => {
        try {
          const result = await checkUrlStatus(
            sourceUrl,
            newDomain,
            { followRedirects, retryAttempts, timeoutSeconds, useOverrideToken, signal: controller.signal }
          )
          return result
        } catch (err) {
          const errorResult: ComparisonResult = {
            sourceUrl,
            newUrl: constructNewUrl(extractPath(sourceUrl), newDomain),
            statusCode: null,
            redirectChain: [],
            finalUrl: null,
            result: 'Error',
            error: err instanceof Error ? err.message : 'Unknown error',
            retryCount: retryAttempts,
            checkedAt: new Date().toISOString()
          }
          return errorResult
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Save results to database
      await db.urlResult.createMany({
        data: batchResults.map(result => ({
          jobId,
          sourceUrl: result.sourceUrl,
          newUrl: result.newUrl,
          statusCode: result.statusCode,
          redirectChain: toJsonString(result.redirectChain),
          finalUrl: result.finalUrl,
          result: result.result,
          error: result.error,
          retryCount: result.retryCount,
          checkedAt: new Date(result.checkedAt)
        }))
      })

      completed += batch.length

      // Update progress
      await db.comparisonJob.update({
        where: { id: jobId },
        data: {
          completedUrls: completed,
          status: completed === sourceUrls.length ? 'completed' : 'running'
        }
      })
    }

    // Final status update (only if not cancelled)
    if (!controller.signal.aborted) {
      await db.comparisonJob.update({
        where: { id: jobId },
        data: { status: 'completed' }
      })
    }

  } catch (error) {
    // Don't update status if job was cancelled
    if (!controller.signal.aborted) {
      console.error(`Error processing job ${jobId}:`, error)
      await db.comparisonJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          lastError: error instanceof Error ? error.message : String(error)
        }
      })
    }
  } finally {
    activeComparisons.delete(jobId)
  }
}



function generateSummary(results: any[]) {
  return {
    totalUrls: results.length,
    ok: results.filter(r => r.result === 'OK').length,
    redirected: results.filter(r => r.result === 'Redirected').length,
    missing: results.filter(r => r.result === 'Missing').length,
    error: results.filter(r => r.result === 'Error').length
  }
}

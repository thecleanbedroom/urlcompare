import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface ComparisonRequest {
  sourceUrls: string[]
  newDomain: string
  config?: {
    followRedirects?: boolean
    maxConcurrency?: number
    retryAttempts?: number
    timeoutSeconds?: number
  }
  name?: string
}

interface ComparisonResult {
  sourceUrl: string
  newUrl: string
  statusCode: number | null
  redirectChain: string[]
  finalUrl: string | null
  result: 'OK' | 'Missing' | 'Error' | 'Redirected'
  error?: string
  retryCount: number
  checkedAt: string
}

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

    // Create comparison job
    const job = await db.comparisonJob.create({
      data: {
        name: name || `Comparison ${new Date().toISOString()}`,
        sourceUrls: JSON.stringify(validUrls),
        newDomain,
        config: JSON.stringify(config),
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
    timeoutSeconds = 10
  } = config

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
      const batch = sourceUrls.slice(i, i + maxConcurrency)
      
      const batchPromises = batch.map(async (sourceUrl) => {
        try {
          const result = await checkUrlStatus(
            sourceUrl,
            newDomain,
            followRedirects,
            retryAttempts,
            timeoutSeconds
          )
          return result
        } catch (err) {
          return {
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
          redirectChain: JSON.stringify(result.redirectChain),
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

    // Final status update
    await db.comparisonJob.update({
      where: { id: jobId },
      data: { status: 'completed' }
    })

  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error)
    await db.comparisonJob.update({
      where: { id: jobId },
      data: { status: 'failed' }
    })
  }
}

async function checkUrlStatus(
  sourceUrl: string,
  newDomain: string,
  followRedirects: boolean,
  retryAttempts: number,
  timeoutSeconds: number
): Promise<ComparisonResult> {
  const extractPath = (url: string): string => {
    try {
      const urlObj = new URL(url)
      return urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
      return '/'
    }
  }

  const constructNewUrl = (path: string, domain: string): string => {
    return domain.replace(/\/$/, '') + path
  }

  let retryCount = 0
  let lastError: string | undefined

  while (retryCount < retryAttempts) {
    try {
      const path = extractPath(sourceUrl)
      const newUrl = constructNewUrl(path, newDomain)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000)

      const response = await fetch(newUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: followRedirects ? 'follow' : 'manual'
      })

      clearTimeout(timeoutId)

      const redirectChain: string[] = []
      let finalUrl = newUrl

      if (response.redirected) {
        const finalResponse = await fetch(newUrl, {
          method: 'GET',
          redirect: 'manual'
        })
        
        if (finalResponse.status === 301 || finalResponse.status === 302 || finalResponse.status === 307 || finalResponse.status === 308) {
          const location = finalResponse.headers.get('location')
          if (location) {
            redirectChain.push(location)
            finalUrl = location
          }
        }
      }

      let result: 'OK' | 'Missing' | 'Error' | 'Redirected' = 'OK'
      if (response.status === 404) result = 'Missing'
      if (response.status >= 400) result = 'Error'
      if (redirectChain.length > 0) result = 'Redirected'

      return {
        sourceUrl,
        newUrl,
        statusCode: response.status,
        redirectChain,
        finalUrl,
        result,
        retryCount,
        checkedAt: new Date().toISOString()
      }

    } catch (err) {
      retryCount++
      lastError = err instanceof Error ? err.message : 'Unknown error'
      
      if (retryCount >= retryAttempts) {
        return {
          sourceUrl,
          newUrl: constructNewUrl(extractPath(sourceUrl), newDomain),
          statusCode: null,
          redirectChain: [],
          finalUrl: null,
          result: 'Error',
          error: lastError,
          retryCount,
          checkedAt: new Date().toISOString()
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
    }
  }

  return {
    sourceUrl,
    newUrl: constructNewUrl(extractPath(sourceUrl), newDomain),
    statusCode: null,
    redirectChain: [],
    finalUrl: null,
    result: 'Error',
    error: lastError,
    retryCount,
    checkedAt: new Date().toISOString()
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
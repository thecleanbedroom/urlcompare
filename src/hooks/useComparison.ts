'use client'

import { useState, useEffect } from 'react'
import type { UrlResult, JobSummary } from '@/types'
import { getBackoffDelay } from '@/lib/polling'

interface UseComparisonReturn {
  sourceUrls: string
  setSourceUrls: (v: string) => void
  newDomain: string
  setNewDomain: (v: string) => void
  jobName: string
  setJobName: (v: string) => void
  followRedirects: boolean
  setFollowRedirects: (v: boolean) => void
  maxConcurrency: number
  setMaxConcurrency: (v: number) => void
  retryAttempts: number
  setRetryAttempts: (v: number) => void
  timeoutSeconds: number
  setTimeoutSeconds: (v: number) => void
  useOverrideToken: boolean
  setUseOverrideToken: (v: boolean) => void
  edgeOverrideToken: string
  setEdgeOverrideToken: (v: string) => void
  results: UrlResult[]
  summary: JobSummary | null
  isRunning: boolean
  error: string | null
  progress: number
  jobId: string | null
  isLoadingJob: boolean
  activeTab: string
  setActiveTab: (v: string) => void
  retryingIds: Set<string>
  runComparison: () => Promise<void>
  retryVerification: (result: UrlResult) => Promise<void>
  cancelJob: () => Promise<void>
  handleCrawlComplete: (urls: string[]) => void
}

export function useComparison(jobIdParam: string | null): UseComparisonReturn {
  const [sourceUrls, setSourceUrls] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [jobName, setJobName] = useState('')
  const [followRedirects, setFollowRedirects] = useState(true)
  const [maxConcurrency, setMaxConcurrency] = useState(10)
  const [retryAttempts, setRetryAttempts] = useState(3)
  const [timeoutSeconds, setTimeoutSeconds] = useState(10)
  const [useOverrideToken, setUseOverrideToken] = useState(false)
  const [edgeOverrideToken, setEdgeOverrideToken] = useState('')
  const [results, setResults] = useState<UrlResult[]>([])
  const [summary, setSummary] = useState<JobSummary | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)
  const [activeTab, setActiveTab] = useState('manual')
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())

  const handleCrawlComplete = (urls: string[]) => {
    setSourceUrls(urls.join('\n'))
    setActiveTab('manual')
  }

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(url => url.trim())
      .filter(url => url && url.startsWith('http'))
  }

  // Load job if jobIdParam is provided
  useEffect(() => {
    let isMounted = true

    const loadJob = async (id: string) => {
      if (!isMounted) return

      try {
        setIsLoadingJob(true)
        setError(null)
        const response = await fetch(`/api/comparison?jobId=${id}`)

        if (!response.ok) {
          throw new Error(`Failed to load job: ${response.status} ${response.statusText}`)
        }

        const responseData = await response.json()
        if (!isMounted) return

        const job = responseData.job
        if (!job) {
          throw new Error('Invalid job data received from server')
        }

        const parsedUrls = typeof job.sourceUrls === 'string'
          ? JSON.parse(job.sourceUrls)
          : job.sourceUrls || []

        const urls = Array.isArray(parsedUrls) ? parsedUrls.join('\n') : ''

        setSourceUrls(urls)
        setNewDomain(job.newDomain)
        setJobName(job.name || '')
        setJobId(job.id)

        if (job.status === 'completed') {
          setResults(responseData.results || [])
          setSummary(responseData.summary)
          setProgress(100)
        } else if (job.status === 'failed') {
          setError(job.lastError ? `Job failed: ${job.lastError}` : 'Job failed')
          setResults(responseData.results || [])
          setSummary(responseData.summary)
        } else if (job.status === 'running') {
          setIsRunning(true)
          await pollForCompletion(job.id)
        } else if (job.status === 'cancelled') {
          setError('Job was cancelled')
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load job')
        }
      } finally {
        if (isMounted) {
          setIsLoadingJob(false)
        }
      }
    }

    if (jobIdParam) {
      loadJob(jobIdParam)
    } else {
      setSourceUrls('')
      setNewDomain('')
      setJobName('')
      setJobId(null)
      setResults([])
      setSummary(null)
      setProgress(0)
    }

    return () => { isMounted = false }
  }, [jobIdParam])

  const pollForCompletion = async (id: string) => {
    const maxPollTime = 300000
    const startTime = Date.now()
    const controller = new AbortController()
    let pollCount = 0

    try {
      while (true) {
        const pollResponse = await fetch(`/api/comparison?jobId=${id}`, {
          signal: controller.signal,
          cache: 'no-store'
        })

        if (!pollResponse.ok) {
          throw new Error(`Failed to fetch job status: ${pollResponse.status}`)
        }

        const pollData = await pollResponse.json()

        if (!pollData.job) {
          throw new Error('Invalid job data received during polling')
        }

        const { job, summary, results } = pollData

        if (job.status === 'completed') {
          setResults(results || [])
          setSummary(summary)
          setIsRunning(false)
          setProgress(100)
          return true
        } else if (job.status === 'failed') {
          const failMsg = job.lastError ? `Job failed: ${job.lastError}` : 'Job failed to complete'
          throw new Error(failMsg)
        } else if (job.status === 'cancelled') {
          setError('Comparison cancelled')
          setIsRunning(false)
          return
        } else {
          if (Date.now() - startTime > maxPollTime) {
            throw new Error('Polling timeout - job taking too long')
          }

          const prog = job.totalUrls > 0
            ? Math.round((job.completedUrls / job.totalUrls) * 100)
            : 0
          setProgress(prog)

          const delay = getBackoffDelay(pollCount)
          pollCount++

          await new Promise((resolve) => {
            const timeoutId = setTimeout(resolve, delay)
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId)
              resolve(null)
            })
          })
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'An error occurred during polling')
        setIsRunning(false)
      }
    } finally {
      controller.abort()
    }
  }

  const runComparison = async () => {
    if (!sourceUrls.trim() || !newDomain.trim()) {
      setError('Please enter source URLs and new domain')
      return
    }

    setIsRunning(true)
    setError(null)
    setResults([])
    setSummary(null)
    setProgress(0)

    const urls = parseUrls(sourceUrls)

    try {
      const response = await fetch('/api/comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrls: urls,
          newDomain,
          name: jobName || undefined,
          config: { followRedirects, maxConcurrency, retryAttempts, timeoutSeconds, useOverrideToken: useOverrideToken || undefined, edgeOverrideToken: (useOverrideToken && edgeOverrideToken) || undefined },
        }),
      })

      if (!response.ok) throw new Error('Failed to start comparison')

      const data = await response.json()
      const currentJobId = data.jobId || jobId
      setJobId(currentJobId)

      if (currentJobId) {
        await pollForCompletion(currentJobId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsRunning(false)
    }
  }

  const cancelJob = async () => {
    if (!jobId) return
    try {
      await fetch(`/api/comparison?jobId=${jobId}`, { method: 'DELETE' })
      setIsRunning(false)
      setError('Comparison cancelled')
    } catch (err) {
      console.error('Error cancelling job:', err)
    }
  }

  const retryVerification = async (result: UrlResult) => {
    if (!result.id) {
      console.error('Cannot retry result without ID')
      return
    }

    const resultId = result.id
    setRetryingIds(prev => new Set(prev).add(resultId))

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId: resultId,
          sourceUrl: result.sourceUrl,
          newDomain: newDomain,
          useOverrideToken: useOverrideToken || undefined,
          edgeOverrideToken: (useOverrideToken && edgeOverrideToken) || undefined
        })
      })

      if (!response.ok) {
        throw new Error('Failed to verify URL')
      }

      const updatedResult = await response.json()

      setResults(prev => prev.map(r =>
        r.id === resultId ? { ...r, ...updatedResult } : r
      ))

      if (summary) {
        const oldResult = result.result
        const newResult = updatedResult.result
        if (oldResult !== newResult) {
          setSummary(prev => {
            if (!prev) return prev
            const updated = { ...prev }
            if (oldResult === 'OK') updated.ok--
            else if (oldResult === 'Missing') updated.missing--
            else if (oldResult === 'Error') updated.error--
            else if (oldResult === 'Redirected') updated.redirected--
            if (newResult === 'OK') updated.ok++
            else if (newResult === 'Missing') updated.missing++
            else if (newResult === 'Error') updated.error++
            else if (newResult === 'Redirected') updated.redirected++
            return updated
          })
        }
      }
    } catch (err) {
      console.error('Error retrying verification:', err)
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev)
        next.delete(resultId)
        return next
      })
    }
  }

  return {
    sourceUrls, setSourceUrls,
    newDomain, setNewDomain,
    jobName, setJobName,
    followRedirects, setFollowRedirects,
    maxConcurrency, setMaxConcurrency,
    retryAttempts, setRetryAttempts,
    timeoutSeconds, setTimeoutSeconds,
    useOverrideToken, setUseOverrideToken,
    edgeOverrideToken, setEdgeOverrideToken,
    results, summary, isRunning, error, progress,
    jobId, isLoadingJob,
    activeTab, setActiveTab,
    retryingIds,
    runComparison, retryVerification,
    cancelJob, handleCrawlComplete,
  }
}

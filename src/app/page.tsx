'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Play, Pause, AlertCircle, CheckCircle, XCircle, Globe, FileText, Maximize2, Minimize2, Loader2, Shield } from 'lucide-react'
import { CrawlForm } from '@/components/CrawlForm'
import { ResultCard } from '@/components/ResultCard'
import { EmptyState } from '@/components/EmptyState'

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

interface JobSummary {
  totalUrls: number
  ok: number
  redirected: number
  missing: number
  error: number
}

function HomeContent() {
  const searchParams = useSearchParams()
  const [sourceUrls, setSourceUrls] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [jobName, setJobName] = useState('')
  const [followRedirects, setFollowRedirects] = useState(true)
  const [maxConcurrency, setMaxConcurrency] = useState(10)
  const [retryAttempts, setRetryAttempts] = useState(3)
  const [timeoutSeconds, setTimeoutSeconds] = useState(10)
  const [useOverrideToken, setUseOverrideToken] = useState(false)
  const [results, setResults] = useState<UrlResult[]>([])
  const [summary, setSummary] = useState<JobSummary | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)
  const [activeTab, setActiveTab] = useState('manual')
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'redirected' | 'not-found'>('all')
  const [pathFilter, setPathFilter] = useState('')
  const [isResultsExpanded, setIsResultsExpanded] = useState(false)

  // Handle crawl completion - switch to manual tab and populate URLs
  const handleCrawlComplete = (urls: string[]) => {
    setSourceUrls(urls.join('\n'));
    setActiveTab('manual');
  };

  const parseUrls = (text: string): string[] => {
    return text
      .split('\n')
      .map(url => url.trim())
      .filter(url => url && url.startsWith('http'))
  }

  // Load job if jobId is in URL
  useEffect(() => {
    let isMounted = true;

    const loadJob = async (id: string) => {
      if (!isMounted) return;

      try {
        setIsLoadingJob(true);
        setError(null);
        console.log('1. Fetching job with ID:', id);
        const response = await fetch(`/api/comparison?jobId=${id}`);
        console.log('2. Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('3. Error response:', errorText);
          throw new Error(`Failed to load job: ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log('4. Job data loaded:', responseData);

        if (!isMounted) {
          console.log('5. Component unmounted, aborting');
          return;
        }

        // The API returns the job in a 'job' property
        const job = responseData.job;
        if (!job) {
          throw new Error('Invalid job data received from server');
        }

        // Parse sourceUrls from the job data
        const sourceUrls = typeof job.sourceUrls === 'string'
          ? JSON.parse(job.sourceUrls)
          : job.sourceUrls || [];

        const urls = Array.isArray(sourceUrls)
          ? sourceUrls.join('\n')
          : '';

        console.log('6. Setting form state with job data');
        setSourceUrls(urls);
        setNewDomain(job.newDomain);
        setJobName(job.name || '');
        setJobId(job.id);

        if (job.status === 'completed') {
          console.log('7. Job is completed, setting results');
          setResults(responseData.results || []);
          setSummary(responseData.summary);
          setProgress(100);
        } else if (job.status === 'failed') {
          console.log('7. Job has failed');
          setError(job.lastError ? `Job failed: ${job.lastError}` : 'Job failed');
          setResults(responseData.results || []);
          setSummary(responseData.summary);
        } else if (job.status === 'running') {
          console.log('7. Job is running, starting polling');
          setIsRunning(true);
          await pollForCompletion(job.id);
        } else if (job.status === 'cancelled') {
          setError('Job was cancelled');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to load job';
          console.error('Error loading job:', errorMessage, err);
          setError(errorMessage);
        }
      } finally {
        if (isMounted) {
          setIsLoadingJob(false);
        }
      }
    };

    const jobIdParam = searchParams.get('jobId');
    if (jobIdParam) {
      console.log('Job ID found in URL, loading job:', jobIdParam);
      loadJob(jobIdParam);
    } else {
      console.log('No job ID in URL, resetting form');
      // Reset form if no jobId is present
      setSourceUrls('');
      setNewDomain('');
      setJobName('');
      setJobId(null);
      setResults([]);
      setSummary(null);
      setProgress(0);
    }

    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const pollForCompletion = async (jobId: string) => {
    const maxPollTime = 300000; // 5 minutes max polling time
    const startTime = Date.now();
    let isCancelled = false;

    // Create a controller to handle cleanup
    const controller = new AbortController();

    try {
      while (!isCancelled) {
        console.log('Polling job status for ID:', jobId);
        const pollResponse = await fetch(`/api/comparison?jobId=${jobId}`, {
          signal: controller.signal,
          cache: 'no-store' // Prevent caching of the poll request
        });

        if (!pollResponse.ok) {
          const errorText = await pollResponse.text();
          console.error('Error polling job status:', pollResponse.status, errorText);
          throw new Error(`Failed to fetch job status: ${pollResponse.status} ${pollResponse.statusText}`);
        }

        const pollData = await pollResponse.json();
        console.log('Poll response data:', pollData);

        if (!pollData.job) {
          throw new Error('Invalid job data received during polling');
        }

        const { job, summary, results } = pollData;

        if (job.status === 'completed') {
          console.log('Job completed, setting results');
          setResults(results || []);
          setSummary(summary);
          setIsRunning(false);
          setProgress(100);
          return true;
        } else if (job.status === 'failed') {
          const failMsg = job.lastError ? `Job failed: ${job.lastError}` : 'Job failed to complete'
          throw new Error(failMsg);
        } else {
          // Check for timeout
          if (Date.now() - startTime > maxPollTime) {
            throw new Error('Polling timeout - job taking too long');
          }

          // Update progress
          const progress = job.totalUrls > 0
            ? Math.round((job.completedUrls / job.totalUrls) * 100)
            : 0;

          console.log(`Job progress: ${progress}% (${job.completedUrls}/${job.totalUrls})`);
          setProgress(progress);

          // Wait before polling again with a way to cancel
          await new Promise((resolve) => {
            const timeoutId = setTimeout(resolve, 2000);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              resolve(null);
            });
          });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'An error occurred during polling');
        setIsRunning(false);
      }
    } finally {
      controller.abort();
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
      const url = '/api/comparison'
      const method = 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrls: urls,
          newDomain,
          name: jobName || undefined,
          config: { followRedirects, maxConcurrency, retryAttempts, timeoutSeconds, useOverrideToken: useOverrideToken || undefined },
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

  const exportResults = (format: 'csv' | 'json') => {
    if (!results || results.length === 0) return

    if (format === 'json') {
      const exportData = {
        summary,
        results,
        exportedAt: new Date().toISOString()
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `url-comparison-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const headers = ['Source URL', 'New URL', 'Status Code', 'Result', 'Final URL']
      const csvContent = [
        headers.join(','),
        ...results.map(r => [
          `"${r.sourceUrl}"`,
          `"${r.newUrl}"`,
          r.statusCode || '',
          r.result,
          `"${r.finalUrl || ''}"`
        ].join(','))
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `url-comparison-${Date.now()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getStatusIcon = (result: string) => {
    switch (result) {
      case 'OK':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'Missing':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'Error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'Redirected':
        return <AlertCircle className="h-4 w-4 text-blue-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (result: string) => {
    const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
      OK: 'success',
      Missing: 'destructive',
      Error: 'destructive',
      Redirected: 'warning'
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
          useOverrideToken: useOverrideToken || undefined
        })
      })

      if (!response.ok) {
        throw new Error('Failed to verify URL')
      }

      const updatedResult = await response.json()

      // Update results in-place
      setResults(prev => prev.map(r =>
        r.id === resultId ? { ...r, ...updatedResult } : r
      ))

      // Update summary counts
      if (summary) {
        const oldResult = result.result
        const newResult = updatedResult.result
        if (oldResult !== newResult) {
          setSummary(prev => {
            if (!prev) return prev
            const updated = { ...prev }
            // Decrement old status count
            if (oldResult === 'OK') updated.ok--
            else if (oldResult === 'Missing') updated.missing--
            else if (oldResult === 'Error') updated.error--
            else if (oldResult === 'Redirected') updated.redirected--
            // Increment new status count
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

  // Fullscreen overlay for results
  if (isResultsExpanded && results.length > 0) {
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportResults('csv')}
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" /> CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportResults('json')}
                className="flex items-center gap-1"
              >
                <Download className="h-4 w-4" /> JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsResultsExpanded(false)}
                className="flex items-center gap-1"
              >
                <Minimize2 className="h-4 w-4" /> Exit Fullscreen
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All ({results.length})
              </Button>
              <Button
                variant={statusFilter === 'ok' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('ok')}
                className={statusFilter === 'ok' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                OK ({results.filter(r => r.result === 'OK').length})
              </Button>
              <Button
                variant={statusFilter === 'redirected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('redirected')}
                className={statusFilter === 'redirected' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
              >
                Redirected ({results.filter(r => r.result === 'Redirected').length})
              </Button>
              <Button
                variant={statusFilter === 'not-found' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('not-found')}
                className={statusFilter === 'not-found' ? 'bg-red-600 hover:bg-red-700' : ''}
              >
                Not Found ({results.filter(r => r.result === 'Missing' || r.result === 'Error').length})
              </Button>
            </div>

            {/* Path search filter */}
            <div className="mb-4">
              <Input
                placeholder="Filter by path... (e.g. 'bed' matches '/bedroom', '/beds')"
                value={pathFilter}
                onChange={(e) => setPathFilter(e.target.value)}
                className="max-w-md"
              />
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-280px)]">
              {results
                .filter(result => {
                  let statusMatch = true
                  if (statusFilter === 'ok') statusMatch = result.result === 'OK'
                  else if (statusFilter === 'redirected') statusMatch = result.result === 'Redirected'
                  else if (statusFilter === 'not-found') statusMatch = result.result === 'Missing' || result.result === 'Error'

                  const pathMatch = pathFilter === '' ||
                    result.sourceUrl.toLowerCase().includes(pathFilter.toLowerCase()) ||
                    result.newUrl.toLowerCase().includes(pathFilter.toLowerCase())

                  return statusMatch && pathMatch
                })
                .map((result, index) => (
                  <ResultCard
                    key={result.id || index}
                    result={result}
                    onRetry={retryVerification}
                    isRetrying={retryingIds.has(result.id || '')}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen h-screen bg-background">
      <div className="grid grid-cols-[1fr_2fr] h-full">
        {/* Left Panel: Configuration */}
        <aside className="border-r overflow-y-auto p-4 space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">URL Comparison Tool</h1>
            <p className="text-sm text-muted-foreground">
              Compare URLs from your old website against the new domain
            </p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuration</CardTitle>
              <CardDescription>
                Enter source URLs manually or scan a domain
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="manual" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Manual URLs
                  </TabsTrigger>
                  <TabsTrigger value="scan" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Scan Domain
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="scan" className="pt-4">
                  <CrawlForm onComplete={handleCrawlComplete} useOverrideToken={useOverrideToken} />
                </TabsContent>

                <TabsContent value="manual" className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="jobName">Job Name (Optional)</Label>
                    <Input
                      id="jobName"
                      value={jobName || ''}
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="My Website Migration"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newDomain">New Domain</Label>
                    <Input
                      id="newDomain"
                      value={newDomain || ''}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="https://newsite.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sourceUrls">Source URLs (one per line)</Label>
                    <Textarea
                      id="sourceUrls"
                      value={sourceUrls || ''}
                      onChange={(e) => setSourceUrls(e.target.value)}
                      placeholder="https://oldsite.com/
https://oldsite.com/about
https://oldsite.com/products/item1"
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="followRedirects" className="text-sm">Follow Redirects</Label>
                      <div className="flex items-center space-x-2">
                        <input
                          id="followRedirects"
                          type="checkbox"
                          checked={followRedirects}
                          onChange={(e) => setFollowRedirects(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">{followRedirects ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxConcurrency" className="text-sm">Max Concurrency</Label>
                      <Input
                        id="maxConcurrency"
                        type="number"
                        min="1"
                        max="50"
                        value={maxConcurrency || ''}
                        onChange={(e) => setMaxConcurrency(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="retryAttempts" className="text-sm">Retry Attempts</Label>
                      <Input
                        id="retryAttempts"
                        type="number"
                        min="0"
                        max="10"
                        value={retryAttempts || ''}
                        onChange={(e) => setRetryAttempts(Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeoutSeconds" className="text-sm">Timeout (sec)</Label>
                      <Input
                        id="timeoutSeconds"
                        type="number"
                        min="1"
                        max="60"
                        value={timeoutSeconds || ''}
                        onChange={(e) => setTimeoutSeconds(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>


                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={(e) => {
                      e.preventDefault();
                      runComparison();
                    }}
                    disabled={isRunning}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      'Start Comparison'
                    )}
                  </Button>
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <Label htmlFor="useOverrideToken" className="text-sm flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  Edge Override Token
                </Label>
                <div className="flex items-center space-x-2">
                  <input
                    id="useOverrideToken"
                    type="checkbox"
                    checked={useOverrideToken}
                    onChange={(e) => setUseOverrideToken(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{useOverrideToken ? 'Enabled' : 'Disabled'}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sends <code className="text-xs">X-EdgeRedirect-Override</code> header (token from <code>.env</code>) to force redirect processing at the origin
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Right Panel: Summary + Results */}
        <main className="h-full overflow-y-auto p-4 space-y-4">
          {/* Loading/Progress State */}
          {isRunning && (
            <Card>
              <CardContent className="py-8">
                <div className="space-y-4 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-lg font-medium">Comparing URLs...</p>
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelJob}
                    className="mt-2"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Section */}
          {summary && !isRunning && (
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
          )}

          {/* Results Section */}
          {results.length > 0 && !isRunning && (
            <Card className="flex-1">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    Detailed results for each URL check
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportResults('csv')}
                    className="flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportResults('json')}
                    className="flex items-center gap-1"
                  >
                    <Download className="h-4 w-4" /> JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsResultsExpanded(true)}
                    className="flex items-center gap-1"
                  >
                    <Maximize2 className="h-4 w-4" /> Fullscreen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filter buttons */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                  >
                    All ({results.length})
                  </Button>
                  <Button
                    variant={statusFilter === 'ok' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('ok')}
                    className={statusFilter === 'ok' ? 'bg-green-600 hover:bg-green-700' : ''}
                  >
                    OK ({results.filter(r => r.result === 'OK').length})
                  </Button>
                  <Button
                    variant={statusFilter === 'redirected' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('redirected')}
                    className={statusFilter === 'redirected' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
                  >
                    Redirected ({results.filter(r => r.result === 'Redirected').length})
                  </Button>
                  <Button
                    variant={statusFilter === 'not-found' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('not-found')}
                    className={statusFilter === 'not-found' ? 'bg-red-600 hover:bg-red-700' : ''}
                  >
                    Not Found ({results.filter(r => r.result === 'Missing' || r.result === 'Error').length})
                  </Button>
                </div>

                {/* Path search filter */}
                <div className="mb-4">
                  <Input
                    placeholder="Filter by path... (e.g. 'bed' matches '/bedroom', '/beds')"
                    value={pathFilter}
                    onChange={(e) => setPathFilter(e.target.value)}
                    className="max-w-md"
                  />
                </div>

                <div className="space-y-4 overflow-y-auto max-h-[calc(100vh-450px)]">
                  {results
                    .filter(result => {
                      let statusMatch = true
                      if (statusFilter === 'ok') statusMatch = result.result === 'OK'
                      else if (statusFilter === 'redirected') statusMatch = result.result === 'Redirected'
                      else if (statusFilter === 'not-found') statusMatch = result.result === 'Missing' || result.result === 'Error'

                      const pathMatch = pathFilter === '' ||
                        result.sourceUrl.toLowerCase().includes(pathFilter.toLowerCase()) ||
                        result.newUrl.toLowerCase().includes(pathFilter.toLowerCase())

                      return statusMatch && pathMatch
                    })
                    .map((result, index) => (
                      <ResultCard
                        key={result.id || index}
                        result={result}
                        onRetry={retryVerification}
                        isRetrying={retryingIds.has(result.id || '')}
                      />
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!isRunning && !summary && results.length === 0 && (
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
  );
}
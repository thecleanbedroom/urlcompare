'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, Play, Pause, AlertCircle, CheckCircle, XCircle } from 'lucide-react'

interface UrlResult {
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

export default function Home() {
  const searchParams = useSearchParams()
  const [sourceUrls, setSourceUrls] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [jobName, setJobName] = useState('')
  const [followRedirects, setFollowRedirects] = useState(true)
  const [maxConcurrency, setMaxConcurrency] = useState(10)
  const [retryAttempts, setRetryAttempts] = useState(3)
  const [timeoutSeconds, setTimeoutSeconds] = useState(10)
  const [results, setResults] = useState<UrlResult[]>([])
  const [summary, setSummary] = useState<JobSummary | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isLoadingJob, setIsLoadingJob] = useState(false)

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
        } else if (job.status === 'running') {
          console.log('7. Job is running, starting polling');
          await pollForCompletion(job.id);
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
          throw new Error('Job failed to complete');
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
          config: { followRedirects, maxConcurrency, retryAttempts, timeoutSeconds },
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
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      OK: 'default',
      Missing: 'destructive',
      Error: 'destructive',
      Redirected: 'secondary'
    }

    return (
      <Badge variant={variants[result] || 'default'} className="flex items-center gap-1">
        {getStatusIcon(result)}
        {result}
      </Badge>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">URL Comparison Tool</h1>
          <p className="text-muted-foreground">
            Compare URLs from your old website against the new domain and check their availability
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Enter your source URLs and new domain to start the comparison
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="followRedirects">Follow Redirects</Label>
                <div className="flex items-center space-x-2">
                  <input
                    id="followRedirects"
                    type="checkbox"
                    checked={followRedirects}
                    onChange={(e) => setFollowRedirects(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">{followRedirects ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxConcurrency">Max Concurrency</Label>
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
                <Label htmlFor="retryAttempts">Retry Attempts</Label>
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
                <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
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

            <div className="flex items-center space-x-4">
              <Button 
                onClick={(e) => {
                  e.preventDefault();
                  runComparison();
                }}
                disabled={isRunning}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Start Comparison
              </Button>

              {results.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => exportResults('csv')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportResults('json')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export JSON
                  </Button>
                </div>
              )}
            </div>

            {isRunning && progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}
          </CardContent>
        </Card>

        {summary && (
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                Detailed results for each URL check
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {results.map((result, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getStatusBadge(result.result)}
                        <span className="font-medium">{result.sourceUrl}</span>
                      </div>
                      {result.statusCode && (
                        <Badge variant="outline">{result.statusCode}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>New URL: {result.newUrl}</div>
                      {result.finalUrl && result.finalUrl !== result.newUrl && (
                        <div>Final URL: {result.finalUrl}</div>
                      )}
                      {result.redirectChain && (
                        (() => {
                          try {
                            const chain = typeof result.redirectChain === 'string' ? JSON.parse(result.redirectChain) : result.redirectChain;
                            return Array.isArray(chain) && chain.length > 0 ? (
                              <div>Redirect Chain: {chain.join(' → ')}</div>
                            ) : null;
                          } catch {
                            return null;
                          }
                        })()
                      )}
                      {result.error && (
                        <div className="text-red-600">Error: {result.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
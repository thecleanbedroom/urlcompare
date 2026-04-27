'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Play, AlertCircle, FileText, Globe, Loader2, Shield } from 'lucide-react'
import { CrawlForm } from '@/components/CrawlForm'

interface ComparisonConfigProps {
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
  activeTab: string
  setActiveTab: (v: string) => void
  isRunning: boolean
  error: string | null
  onRun: () => void
  onCrawlComplete: (urls: string[]) => void
}

export function ComparisonConfig({
  sourceUrls, setSourceUrls,
  newDomain, setNewDomain,
  jobName, setJobName,
  followRedirects, setFollowRedirects,
  maxConcurrency, setMaxConcurrency,
  retryAttempts, setRetryAttempts,
  timeoutSeconds, setTimeoutSeconds,
  useOverrideToken, setUseOverrideToken,
  edgeOverrideToken, setEdgeOverrideToken,
  activeTab, setActiveTab,
  isRunning, error,
  onRun, onCrawlComplete,
}: ComparisonConfigProps) {
  return (
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
              <CrawlForm onComplete={onCrawlComplete} useOverrideToken={useOverrideToken} edgeOverrideToken={edgeOverrideToken} />
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
                  placeholder={`https://oldsite.com/\nhttps://oldsite.com/about\nhttps://oldsite.com/products/item1`}
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
                  e.preventDefault()
                  onRun()
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

          <div className="border-t pt-4 mt-4 space-y-3">
            <Label className="text-sm flex items-center gap-1 font-medium">
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
              <Label htmlFor="useOverrideToken" className="text-sm cursor-pointer">
                {useOverrideToken ? 'Enabled' : 'Disabled'}
              </Label>
            </div>
            {useOverrideToken && (
              <div className="space-y-2">
                <Label htmlFor="edgeOverrideToken" className="text-sm">Token Value</Label>
                <Input
                  id="edgeOverrideToken"
                  type="password"
                  value={edgeOverrideToken}
                  onChange={(e) => setEdgeOverrideToken(e.target.value)}
                  placeholder="Enter your edge override token"
                  autoComplete="off"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Sends <code className="text-xs">X-EdgeRedirect-Override</code> header with the token above to force redirect processing at the origin
            </p>
          </div>
        </CardContent>
      </Card>
    </aside>
  )
}

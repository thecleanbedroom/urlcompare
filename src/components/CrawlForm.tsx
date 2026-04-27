'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
    Search,
    Settings2,
    ChevronDown,
    Loader2,
    CheckCircle,
    XCircle,
    ArrowRight
} from 'lucide-react';
import { getBackoffDelay } from '@/lib/polling';

interface CrawlFormProps {
    onComplete?: (urls: string[]) => void;
    useOverrideToken?: boolean;
    edgeOverrideToken?: string;
}

interface CrawlJob {
    id: string;
    status: string;
    totalDiscovered: number;
    pagesVisited: number;
    errorCount: number;
    lastError?: string;
}

export function CrawlForm({ onComplete, useOverrideToken, edgeOverrideToken }: CrawlFormProps) {
    const [sourceDomain, setSourceDomain] = useState('');
    const [jobName, setJobName] = useState('');
    const [maxPages, setMaxPages] = useState(100);
    const [maxDepth, setMaxDepth] = useState(10);
    const [delayMs, setDelayMs] = useState(200);
    const [excludePatterns, setExcludePatterns] = useState('');
    const [includePatterns, setIncludePatterns] = useState('');

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentJob, setCurrentJob] = useState<CrawlJob | null>(null);
    const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([]);

    const startCrawl = async () => {
        if (!sourceDomain.trim()) {
            setError('Please enter a source domain URL');
            return;
        }

        // Validate URL
        try {
            new URL(sourceDomain);
        } catch {
            setError('Invalid URL format. Please enter a valid URL (e.g., https://example.com)');
            return;
        }

        setIsRunning(true);
        setError(null);
        setDiscoveredUrls([]);
        setCurrentJob(null);

        try {
            // Parse patterns
            const excludeArray = excludePatterns
                .split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0);

            const includeArray = includePatterns
                .split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0);

            // Start crawl job
            const response = await fetch('/api/crawl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceDomain,
                    name: jobName || undefined,
                    maxPages,
                    maxDepth,
                    delayMs,
                    excludePatterns: excludeArray.length > 0 ? excludeArray : undefined,
                    includePatterns: includeArray.length > 0 ? includeArray : undefined,
                    useOverrideToken: useOverrideToken || undefined,
                    edgeOverrideToken: (useOverrideToken && edgeOverrideToken) || undefined,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to start crawl');
            }

            const data = await response.json();
            const jobId = data.jobId;

            // Poll for completion
            await pollCrawlJob(jobId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsRunning(false);
        }
    };

    const pollCrawlJob = async (jobId: string) => {
        const maxPollTime = 600000; // 10 minutes
        const startTime = Date.now();
        let pollCount = 0;

        while (true) {
            if (Date.now() - startTime > maxPollTime) {
                setError('Crawl timeout - job taking too long');
                setIsRunning(false);
                return;
            }

            try {
                const response = await fetch(`/api/crawl?jobId=${jobId}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch crawl status');
                }

                const data = await response.json();
                const job = data.job as CrawlJob;
                setCurrentJob(job);

                if (job.status === 'completed') {
                    setDiscoveredUrls(data.discoveredUrls || []);
                    setIsRunning(false);
                    return;
                } else if (job.status === 'failed') {
                    setError(job.lastError || 'Crawl failed');
                    setIsRunning(false);
                    return;
                } else if (job.status === 'cancelled') {
                    setError('Crawl was cancelled');
                    setIsRunning(false);
                    return;
                }

                // Wait before polling again (with backoff)
                const delay = getBackoffDelay(pollCount)
                pollCount++
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
                setIsRunning(false);
                return;
            }
        }
    };

    const cancelCrawl = async () => {
        if (!currentJob) return;

        try {
            await fetch(`/api/crawl?jobId=${currentJob.id}`, {
                method: 'DELETE',
            });
        } catch {
            // Ignore cancel errors
        }
    };

    const handleUseForComparison = () => {
        if (discoveredUrls.length > 0 && onComplete) {
            onComplete(discoveredUrls);
        }
    };

    const progress = currentJob ?
        Math.min(100, Math.round((currentJob.pagesVisited / maxPages) * 100)) : 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="sourceDomain">Source Domain</Label>
                    <Input
                        id="sourceDomain"
                        value={sourceDomain}
                        onChange={(e) => setSourceDomain(e.target.value)}
                        placeholder="https://oldsite.com"
                        disabled={isRunning}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="crawlJobName">Job Name (Optional)</Label>
                    <Input
                        id="crawlJobName"
                        value={jobName}
                        onChange={(e) => setJobName(e.target.value)}
                        placeholder="My Website Crawl"
                        disabled={isRunning}
                    />
                </div>
            </div>

            <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-0">
                        <Settings2 className="h-4 w-4" />
                        Advanced Options
                        <ChevronDown className={`h-4 w-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="maxPages">Max Pages</Label>
                            <Input
                                id="maxPages"
                                type="number"
                                min={1}
                                max={5000}
                                value={maxPages}
                                onChange={(e) => setMaxPages(Number(e.target.value) || 100)}
                                disabled={isRunning}
                            />
                            <p className="text-xs text-muted-foreground">Maximum pages to crawl</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="maxDepth">Max Depth</Label>
                            <Input
                                id="maxDepth"
                                type="number"
                                min={1}
                                max={50}
                                value={maxDepth}
                                onChange={(e) => setMaxDepth(Number(e.target.value) || 10)}
                                disabled={isRunning}
                            />
                            <p className="text-xs text-muted-foreground">Maximum link depth</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="delayMs">Request Delay (ms)</Label>
                            <Input
                                id="delayMs"
                                type="number"
                                min={0}
                                max={5000}
                                value={delayMs}
                                onChange={(e) => setDelayMs(Number(e.target.value) || 200)}
                                disabled={isRunning}
                            />
                            <p className="text-xs text-muted-foreground">Delay between requests</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="excludePatterns">Exclude Patterns (one per line)</Label>
                            <Textarea
                                id="excludePatterns"
                                value={excludePatterns}
                                onChange={(e) => setExcludePatterns(e.target.value)}
                                placeholder="*/wp-admin/*&#10;*.pdf&#10;*/feed/*"
                                className="min-h-[80px]"
                                disabled={isRunning}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="includePatterns">Include Patterns (one per line)</Label>
                            <Textarea
                                id="includePatterns"
                                value={includePatterns}
                                onChange={(e) => setIncludePatterns(e.target.value)}
                                placeholder="Leave empty to include all (optional)"
                                className="min-h-[80px]"
                                disabled={isRunning}
                            />
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {error && (
                <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="flex items-center gap-4">
                {!isRunning ? (
                    <Button
                        onClick={startCrawl}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Search className="h-4 w-4 mr-2" />
                        Start Crawl
                    </Button>
                ) : (
                    <Button
                        onClick={cancelCrawl}
                        variant="destructive"
                    >
                        Cancel Crawl
                    </Button>
                )}
            </div>

            {isRunning && currentJob && (
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Crawling...</span>
                                </div>
                                <Badge variant="secondary">{currentJob.status}</Badge>
                            </div>
                            <Progress value={progress} />
                            <div className="grid grid-cols-3 gap-4 text-center text-sm">
                                <div>
                                    <div className="font-bold">{currentJob.pagesVisited}</div>
                                    <div className="text-muted-foreground">Pages Visited</div>
                                </div>
                                <div>
                                    <div className="font-bold">{currentJob.totalDiscovered}</div>
                                    <div className="text-muted-foreground">URLs Discovered</div>
                                </div>
                                <div>
                                    <div className="font-bold">{currentJob.errorCount}</div>
                                    <div className="text-muted-foreground">Errors</div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {discoveredUrls.length > 0 && !isRunning && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            Crawl Complete
                        </CardTitle>
                        <CardDescription>
                            Discovered {discoveredUrls.length} URLs from {sourceDomain}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                            <div className="space-y-1 text-sm font-mono">
                                {discoveredUrls.slice(0, 100).map((url, index) => (
                                    <div key={index} className="truncate hover:text-blue-600">
                                        {url}
                                    </div>
                                ))}
                                {discoveredUrls.length > 100 && (
                                    <div className="text-muted-foreground pt-2">
                                        ... and {discoveredUrls.length - 100} more URLs
                                    </div>
                                )}
                            </div>
                        </div>

                        {onComplete && (
                            <Button
                                onClick={handleUseForComparison}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                Use for Comparison
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
    ArrowRight,
    KeyRound
} from 'lucide-react';
import { getBackoffDelay } from '@/lib/polling';
import type { DiscoverySource } from 'shared-types';

interface CrawlFormProps {
    onComplete?: (urls: string[], urlSetId?: string) => void;
    useOverrideToken?: boolean;
    edgeOverrideToken?: string;
}

interface DiscoveryJob {
    id: string;
    status: string;
    pagesVisited: number;
    errorCount: number;
    lastError?: string;
    urlSetId: string | null;
    urlCount: number;
}

interface UrlRow {
    id: string;
    url: string;
    sources: string[];
    included: boolean;
}

export function CrawlForm({ onComplete, useOverrideToken, edgeOverrideToken }: CrawlFormProps) {
    const searchParams = useSearchParams();
    const [sourceDomain, setSourceDomain] = useState('');
    const [jobName, setJobName] = useState('');
    const [sources, setSources] = useState<DiscoverySource[]>(['crawl', 'sitemap']);
    const [maxPages, setMaxPages] = useState(10000);
    const [maxDepth, setMaxDepth] = useState(20);
    const [delayMs, setDelayMs] = useState(200);
    const [excludePatterns, setExcludePatterns] = useState('');
    const [includePatterns, setIncludePatterns] = useState('');
    const [queryPolicy, setQueryPolicy] = useState<'ignore' | 'allow' | 'deny'>('ignore');
    const [queryKeys, setQueryKeys] = useState('');
    const [normalizeQuery, setNormalizeQuery] = useState(true);
    const [ignoreAnchors, setIgnoreAnchors] = useState(true);

    const [gscConnected, setGscConnected] = useState<boolean | null>(null);
    const [gscNotice, setGscNotice] = useState<string | null>(null);

    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentJob, setCurrentJob] = useState<DiscoveryJob | null>(null);
    const [urlRows, setUrlRows] = useState<UrlRow[]>([]);
    const [urlSetTotal, setUrlSetTotal] = useState(0);
    const [manualUrl, setManualUrl] = useState('');

    useEffect(() => {
        fetch('/api/auth/google/status')
            .then(r => r.ok ? r.json() : { connected: false })
            .then(d => setGscConnected(!!d.connected))
            .catch(() => setGscConnected(false));

        const gsc = searchParams.get('gsc');
        if (gsc === 'connected') setGscNotice('Google Search Console connected.');
        if (gsc === 'error') setGscNotice('Google connection failed — try again.');
    }, [searchParams]);

    const toggleSource = (source: DiscoverySource) => {
        setSources(prev => prev.includes(source)
            ? prev.filter(s => s !== source)
            : [...prev, source]);
    };

    const startDiscovery = async () => {
        if (!sourceDomain.trim()) {
            setError('Please enter a source domain URL');
            return;
        }
        if (sources.length === 0) {
            setError('Select at least one discovery source');
            return;
        }

        try {
            new URL(sourceDomain);
        } catch {
            setError('Invalid URL format. Please enter a valid URL (e.g., https://example.com)');
            return;
        }

        setIsRunning(true);
        setError(null);
        setUrlRows([]);
        setCurrentJob(null);

        try {
            const excludeArray = excludePatterns.split('\n').map(p => p.trim()).filter(Boolean);
            const includeArray = includePatterns.split('\n').map(p => p.trim()).filter(Boolean);
            const keyList = queryKeys.split(',').map(k => k.trim()).filter(Boolean);

            const response = await fetch('/api/discovery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceDomain,
                    sources,
                    name: jobName || undefined,
                    maxPages,
                    maxDepth,
                    delayMs,
                    excludePatterns: excludeArray.length > 0 ? excludeArray : undefined,
                    includePatterns: includeArray.length > 0 ? includeArray : undefined,
                    queryPolicy,
                    queryAllowKeys: queryPolicy === 'allow' ? keyList : undefined,
                    queryDenyKeys: queryPolicy === 'deny' ? keyList : undefined,
                    normalizeQuery,
                    ignoreAnchors,
                    useOverrideToken: useOverrideToken || undefined,
                    edgeOverrideToken: (useOverrideToken && edgeOverrideToken) || undefined,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                if (data.error === 'gsc_not_connected') {
                    setGscConnected(false);
                    throw new Error(data.hint || data.message || 'Google Search Console is not connected');
                }
                throw new Error(data.error || 'Failed to start discovery');
            }

            await pollDiscoveryJob(data.jobId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsRunning(false);
        }
    };

    const pollDiscoveryJob = async (jobId: string) => {
        const maxPollTime = 600000;
        const startTime = Date.now();
        let pollCount = 0;

        while (true) {
            if (Date.now() - startTime > maxPollTime) {
                setError('Discovery timeout - job taking too long');
                setIsRunning(false);
                return;
            }

            try {
                const response = await fetch(`/api/discovery/${jobId}`);
                if (!response.ok) throw new Error('Failed to fetch discovery status');

                const job = await response.json() as DiscoveryJob;
                setCurrentJob(job);

                if (job.status === 'completed') {
                    if (job.urlSetId) await loadUrlSet(job.urlSetId);
                    setIsRunning(false);
                    return;
                } else if (job.status === 'failed') {
                    setError(job.lastError || 'Discovery failed');
                    setIsRunning(false);
                    return;
                } else if (job.status === 'cancelled') {
                    setError('Discovery was cancelled');
                    setIsRunning(false);
                    return;
                }

                const delay = getBackoffDelay(pollCount);
                pollCount++;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
                setIsRunning(false);
                return;
            }
        }
    };

    const loadUrlSet = async (urlSetId: string) => {
        const response = await fetch(`/api/urlsets/${urlSetId}?limit=500`);
        if (!response.ok) return;
        const data = await response.json();
        setUrlRows(data.urls || []);
        setUrlSetTotal(data.total || 0);
    };

    const toggleUrl = async (row: UrlRow) => {
        if (!currentJob?.urlSetId) return;
        const updated = { ...row, included: !row.included };
        setUrlRows(prev => prev.map(r => r.id === row.id ? updated : r));
        await fetch(`/api/urlsets/${currentJob.urlSetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ included: [{ urlId: row.id, included: updated.included }] }),
        });
    };

    const addManualUrl = async () => {
        if (!currentJob?.urlSetId || !manualUrl.trim()) return;
        const response = await fetch(`/api/urlsets/${currentJob.urlSetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addManualUrls: [manualUrl.trim()] }),
        });
        if (response.ok) {
            setManualUrl('');
            await loadUrlSet(currentJob.urlSetId);
        }
    };

    const cancelDiscovery = async () => {
        if (!currentJob) return;
        try {
            await fetch(`/api/discovery/${currentJob.id}`, { method: 'DELETE' });
        } catch {
            // Ignore cancel errors
        }
    };

    const includedUrls = urlRows.filter(r => r.included).map(r => r.url);

    const handleUseForComparison = () => {
        if (includedUrls.length > 0 && onComplete && currentJob?.urlSetId) {
            onComplete(includedUrls, currentJob.urlSetId);
        }
    };

    const progress = currentJob && maxPages > 0
        ? Math.min(100, Math.round((currentJob.pagesVisited / maxPages) * 100)) : 0;

    return (
        <div className="space-y-4">
            {gscNotice && (
                <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{gscNotice}</AlertDescription>
                </Alert>
            )}

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

            <div className="space-y-2">
                <Label>Discovery Sources</Label>
                <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={sources.includes('crawl')}
                            onChange={() => toggleSource('crawl')}
                            disabled={isRunning}
                        />
                        Crawl site
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={sources.includes('sitemap')}
                            onChange={() => toggleSource('sitemap')}
                            disabled={isRunning}
                        />
                        Sitemap
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={sources.includes('gsc')}
                            onChange={() => toggleSource('gsc')}
                            disabled={isRunning}
                        />
                        Search Console
                        {gscConnected === true && <Badge variant="secondary">connected</Badge>}
                    </label>
                </div>
                {sources.includes('gsc') && gscConnected === false && (
                    <Alert>
                        <KeyRound className="h-4 w-4" />
                        <AlertDescription className="flex items-center justify-between gap-2">
                            Google Search Console is not connected.
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { window.location.href = '/api/auth/google/start'; }}
                            >
                                Connect Google
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
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
                                max={50000}
                                value={maxPages}
                                onChange={(e) => setMaxPages(Number(e.target.value) || 10000)}
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
                                max={1000}
                                value={maxDepth}
                                onChange={(e) => setMaxDepth(Number(e.target.value) || 20)}
                                disabled={isRunning}
                            />
                            {maxDepth > 100 && (
                                <p className="text-xs text-amber-600">Depths above 100 can take a very long time.</p>
                            )}
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
                            <Label htmlFor="queryPolicy">Query Strings</Label>
                            <select
                                id="queryPolicy"
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={queryPolicy}
                                onChange={(e) => setQueryPolicy(e.target.value as 'ignore' | 'allow' | 'deny')}
                                disabled={isRunning}
                            >
                                <option value="ignore">Strip all query strings</option>
                                <option value="allow">Keep only allowed keys</option>
                                <option value="deny">Drop denied keys</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="queryKeys">
                                {queryPolicy === 'allow' ? 'Allowed keys' : queryPolicy === 'deny' ? 'Denied keys' : 'Keys (unused)'}
                            </Label>
                            <Input
                                id="queryKeys"
                                value={queryKeys}
                                onChange={(e) => setQueryKeys(e.target.value)}
                                placeholder="utm_source, page, lang"
                                disabled={isRunning || queryPolicy === 'ignore'}
                            />
                        </div>
                    </div>

                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={normalizeQuery}
                                onChange={(e) => setNormalizeQuery(e.target.checked)}
                                disabled={isRunning || queryPolicy === 'ignore'}
                            />
                            Normalize query keys
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={ignoreAnchors}
                                onChange={(e) => setIgnoreAnchors(e.target.checked)}
                                disabled={isRunning}
                            />
                            Strip #fragments
                        </label>
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
                        onClick={startDiscovery}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Search className="h-4 w-4 mr-2" />
                        Start Discovery
                    </Button>
                ) : (
                    <Button onClick={cancelDiscovery} variant="destructive">
                        Cancel
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
                                    <span>Discovering URLs...</span>
                                </div>
                                <Badge variant="secondary">{currentJob.status}</Badge>
                            </div>
                            <Progress value={progress} />
                            <div className="grid grid-cols-2 gap-4 text-center text-sm">
                                <div>
                                    <div className="font-bold">{currentJob.pagesVisited}</div>
                                    <div className="text-muted-foreground">Pages Visited</div>
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

            {urlRows.length > 0 && !isRunning && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            Discovery Complete
                        </CardTitle>
                        <CardDescription>
                            {includedUrls.length} of {urlSetTotal} URLs included from {sourceDomain}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                            <div className="space-y-1 text-sm font-mono">
                                {urlRows.map((row) => (
                                    <label key={row.id} className="flex items-center gap-2 truncate hover:text-blue-600">
                                        <input
                                            type="checkbox"
                                            checked={row.included}
                                            onChange={() => toggleUrl(row)}
                                        />
                                        <span className="truncate">{row.url}</span>
                                        <span className="text-muted-foreground text-xs shrink-0">
                                            {row.sources.join('+')}
                                        </span>
                                    </label>
                                ))}
                                {urlSetTotal > urlRows.length && (
                                    <div className="text-muted-foreground pt-2">
                                        ... and {urlSetTotal - urlRows.length} more URLs (all included)
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Input
                                value={manualUrl}
                                onChange={(e) => setManualUrl(e.target.value)}
                                placeholder="Add a URL manually (https://...)"
                            />
                            <Button variant="outline" onClick={addManualUrl} disabled={!manualUrl.trim()}>
                                Add
                            </Button>
                        </div>

                        {onComplete && (
                            <Button
                                onClick={handleUseForComparison}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={includedUrls.length === 0}
                            >
                                Use {includedUrls.length} URLs for Comparison
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

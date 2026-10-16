'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    ArrowLeft,
    Globe,
    Clock,
    Loader2,
    CheckCircle,
    XCircle,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CrawlJob {
    id: string;
    name: string | null;
    sourceDomain: string;
    status: string;
    totalDiscovered: number;
    pagesVisited: number;
    errorCount: number;
    createdAt: string;
    completedAt: string | null;
}

export default function CrawlJobsPage() {
    const [jobs, setJobs] = useState<CrawlJob[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchJobs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch('/api/crawl');
            if (!response.ok) {
                throw new Error('Failed to fetch crawl jobs');
            }
            const data = await response.json();
            setJobs(data.jobs || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <Badge className="bg-green-600 hover:bg-green-700">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Completed
                    </Badge>
                );
            case 'crawling':
                return (
                    <Badge className="bg-blue-600 hover:bg-blue-700">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Crawling
                    </Badge>
                );
            case 'failed':
                return (
                    <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                    </Badge>
                );
            case 'cancelled':
                return (
                    <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        Cancelled
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {status}
                    </Badge>
                );
        }
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                <Globe className="h-6 w-6" />
                                Crawl Jobs
                            </h1>
                            <p className="text-muted-foreground">
                                View history of domain crawl operations
                            </p>
                        </div>
                    </div>
                    <Button onClick={fetchJobs} variant="outline" size="sm">
                        <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Recent Crawl Jobs</CardTitle>
                        <CardDescription>
                            Domain scanning history showing discovered URLs and status
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading && jobs.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : error ? (
                            <div className="flex items-center justify-center py-8 text-destructive">
                                <AlertCircle className="h-5 w-5 mr-2" />
                                {error}
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No crawl jobs yet</p>
                                <p className="text-sm">Start by scanning a domain from the home page</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Domain</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">URLs Found</TableHead>
                                        <TableHead className="text-right">Visited</TableHead>
                                        <TableHead className="text-right">Errors</TableHead>
                                        <TableHead>Created</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {jobs.map((job) => (
                                        <TableRow key={job.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">
                                                        {job.name || 'Unnamed Crawl'}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground truncate max-w-xs">
                                                        {job.sourceDomain}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(job.status)}</TableCell>
                                            <TableCell className="text-right font-medium">
                                                {job.totalDiscovered.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {job.pagesVisited.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {job.errorCount > 0 ? (
                                                    <span className="text-red-600">{job.errorCount}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">0</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { JobCard } from '@/components/JobCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { JobStatus } from '@/types';

type Job = {
  id: string;
  name: string | null;
  status: JobStatus;
  createdAt: string;
  totalUrls: number;
  completedUrls: number;
  newDomain: string;
};

function JobsContent() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        setJobs([]);
        return;
      }
      const data = await response.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Job History</h1>
          <p className="text-muted-foreground">View and manage your previous URL comparison jobs</p>
        </div>

        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <p className="text-gray-500">No jobs available.</p>
                <Button className="mt-4" asChild>
                  <a href="/">Start a new comparison</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                id={job.id}
                name={job.name || 'Untitled Job'}
                status={job.status}
                createdAt={job.createdAt}
                totalUrls={job.totalUrls}
                completedUrls={job.completedUrls}
                newDomain={job.newDomain}
                onDelete={(deletedId) => setJobs(prev => prev.filter(j => j.id !== deletedId))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    }>
      <JobsContent />
    </Suspense>
  );
}

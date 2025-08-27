'use client';

import { useEffect, useState } from 'react';
import { JobCard } from '@/components/JobCard';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

type Job = {
  id: string;
  name: string | null;
  status: string;
  createdAt: string;
  totalUrls: number;
  completedUrls: number;
  newDomain: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data = await response.json();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      console.error('Error fetching jobs:', err);
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

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
          <Button variant="outline" onClick={fetchJobs} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Job History</h1>
        <Button asChild>
          <a href="/">New Comparison</a>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No jobs found</p>
          <Button className="mt-4" asChild>
            <a href="/">Start a new comparison</a>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              id={job.id}
              name={job.name || 'Untitled Job'}
              status={job.status as any}
              createdAt={job.createdAt}
              totalUrls={job.totalUrls}
              completedUrls={job.completedUrls}
              newDomain={job.newDomain}
            />
          ))}
        </div>
      )}
    </div>
  );
}

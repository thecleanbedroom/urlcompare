import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface JobCardProps {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: string | Date;
  totalUrls: number;
  completedUrls: number;
  newDomain: string;
}

export function JobCard({ id, name, status, createdAt, totalUrls, completedUrls, newDomain }: JobCardProps) {
  const statusVariant = {
    pending: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }[status];

  const progress = totalUrls > 0 ? Math.round((completedUrls / totalUrls) * 100) : 0;
  const date = new Date(createdAt);
  const timeAgo = formatDistanceToNow(date, { addSuffix: true });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{name || 'Untitled Job'}</CardTitle>
            <CardDescription className="mt-1">
              Created {timeAgo} • {totalUrls} URLs • {newDomain}
            </CardDescription>
          </div>
          <Badge className={statusVariant}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-sm text-gray-500 mt-1">
          <span>{completedUrls} of {totalUrls} processed</span>
          <span>{progress}%</span>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" asChild>
          <Link href={`/jobs/${id}`}>View Details</Link>
        </Button>
        <Button asChild>
          <Link href={`/?jobId=${id}`}>
            {status === 'completed' ? 'View Results' : 'View Progress'}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

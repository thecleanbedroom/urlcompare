import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Get the existing job
    const existingJob = await db.comparisonJob.findUnique({
      where: { id: jobId },
      include: {
        urlResults: true
      }
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Create a new job with the same parameters
    const newJob = await db.comparisonJob.create({
      data: {
        name: `(Rerun) ${existingJob.name || 'Job'}`,
        sourceUrls: existingJob.sourceUrls,
        newDomain: existingJob.newDomain,
        config: existingJob.config,
        status: 'pending',
        totalUrls: existingJob.totalUrls,
        completedUrls: 0,
      }
    });

    return NextResponse.json({
      jobId: newJob.id,
      message: 'Job rerun started',
      totalUrls: newJob.totalUrls
    });

  } catch (error) {
    console.error('Error rerunning job:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

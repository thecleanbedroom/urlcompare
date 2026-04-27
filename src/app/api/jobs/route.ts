import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const jobs = await db.comparisonJob.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { urlResults: true }
        },
        urlResults: {
          select: { result: true },
          take: 1
        }
      }
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

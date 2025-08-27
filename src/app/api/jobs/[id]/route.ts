import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface Params {
  params: {
    id: string;
  };
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = params;

  try {
    // First, check if the job exists
    const job = await db.comparisonJob.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Delete the job and its related records in a transaction
    await db.$transaction([
      // Delete URL results first due to foreign key constraint
      db.urlResult.deleteMany({
        where: { jobId: id },
      }),
      // Then delete the job
      db.comparisonJob.delete({
        where: { id },
      }),
    ]);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  }
}

// Return 405 Method Not Allowed for other HTTP methods
export function GET() {
  return new NextResponse(null, { status: 405 });
}

export function POST() {
  return new NextResponse(null, { status: 405 });
}

export function PUT() {
  return new NextResponse(null, { status: 405 });
}

export function PATCH() {
  return new NextResponse(null, { status: 405 });
}

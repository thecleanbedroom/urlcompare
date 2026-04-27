import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkUrlStatus } from '@/lib/urlChecker'
import { safeParseJson, toJsonString } from '@/lib/json'

interface VerifyRequest {
    resultId: string
    sourceUrl: string
    newDomain: string
    overrideToken?: string
}

export async function POST(request: NextRequest) {
    try {
        const body: VerifyRequest = await request.json()
        const { resultId, sourceUrl, newDomain, overrideToken } = body

        // Validate input
        if (!resultId || !sourceUrl || !newDomain) {
            return NextResponse.json(
                { error: 'resultId, sourceUrl, and newDomain are required' },
                { status: 400 }
            )
        }

        // Check if result exists
        const existingResult = await db.urlResult.findUnique({
            where: { id: resultId }
        })

        if (!existingResult) {
            return NextResponse.json(
                { error: 'Result not found' },
                { status: 404 }
            )
        }

        // Re-run the URL check
        const updatedResult = await checkUrlStatus(sourceUrl, newDomain, {
            followRedirects: true,
            retryAttempts: 3,
            timeoutSeconds: 10,
            overrideToken
        })

        // Update database record
        const savedResult = await db.urlResult.update({
            where: { id: resultId },
            data: {
                newUrl: updatedResult.newUrl,
                statusCode: updatedResult.statusCode,
                redirectChain: toJsonString(updatedResult.redirectChain),
                finalUrl: updatedResult.finalUrl,
                result: updatedResult.result,
                error: updatedResult.error,
                retryCount: updatedResult.retryCount,
                checkedAt: new Date(updatedResult.checkedAt)
            }
        })

        // Return updated result in the same format as the comparison API
        return NextResponse.json({
            id: savedResult.id,
            sourceUrl: savedResult.sourceUrl,
            newUrl: savedResult.newUrl,
            statusCode: savedResult.statusCode,
            result: savedResult.result,
            finalUrl: savedResult.finalUrl,
            redirectChain: safeParseJson<string[]>(savedResult.redirectChain as string, []),
            error: savedResult.error,
            checkedAt: savedResult.checkedAt.toISOString()
        })

    } catch (error) {
        console.error('Error verifying URL:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

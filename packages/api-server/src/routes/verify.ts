import { Hono } from 'hono'
import { db } from '../lib/db'
import { badRequest, notFound, serverError } from '../lib/http'
import { checkUrlStatus, safeParseJson, toJsonString } from 'shared-logic'
import { z } from 'zod'

const VerifyRequestSchema = z.object({
    resultId: z.string().min(1).optional(),
    sourceUrl: z.string().url(),
    newDomain: z.string().min(1),
    followRedirects: z.boolean().optional(),
    useOverrideToken: z.boolean().optional(),
    edgeOverrideToken: z.string().optional(),
})

export const verifyRoute = new Hono()

verifyRoute.post('/', async (c) => {
    try {
        const body = await c.req.json()
        const parsed = VerifyRequestSchema.safeParse(body)
        if (!parsed.success) {
            return badRequest(c, 'sourceUrl and newDomain are required')
        }

        const { resultId, sourceUrl, newDomain, followRedirects, useOverrideToken, edgeOverrideToken } = parsed.data

        // Stateless mode (MCP check_url) — just check, don't persist.
        if (!resultId) {
            const result = await checkUrlStatus(sourceUrl, newDomain, {
                followRedirects: followRedirects ?? true,
                retryAttempts: 3,
                timeoutSeconds: 10,
                useOverrideToken,
                edgeOverrideToken
            })
            return c.json(result)
        }

        const existingResult = await db.urlResult.findUnique({
            where: { id: resultId }
        })
        if (!existingResult) return notFound(c, 'Result not found')

        const updatedResult = await checkUrlStatus(sourceUrl, newDomain, {
            followRedirects: true,
            retryAttempts: 3,
            timeoutSeconds: 10,
            useOverrideToken,
            edgeOverrideToken
        })

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

        return c.json({
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
        return serverError(c)
    }
})

import type { Context } from 'hono'
import type { ZodError } from 'zod'

export function badRequest(c: Context, error: string, details?: unknown) {
    return c.json(details !== undefined ? { error, details } : { error }, 400)
}

export function notFound(c: Context, error = 'Not found') {
    return c.json({ error }, 404)
}

export function serverError(c: Context, error = 'Internal server error') {
    return c.json({ error }, 500)
}

export function formatIssues(error: ZodError) {
    return error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
    }))
}

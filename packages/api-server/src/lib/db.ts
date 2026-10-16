import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { isAbsolute, join } from 'path'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

/**
 * file: URLs in DATABASE_URL resolve relative to process.cwd() —
 * the api-server package root in dev, /app in the Docker image.
 */
function resolveDatabaseUrl(url: string): string {
    const match = url.match(/^file:(.+)$/)
    if (!match) return url
    const path = match[1]
    return isAbsolute(path) ? path : join(process.cwd(), path)
}

export const db =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl(process.env.DATABASE_URL ?? 'file:./db/custom.db') }),
        log: process.env.PRISMA_DEBUG === 'true' ? ['query'] : [],
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

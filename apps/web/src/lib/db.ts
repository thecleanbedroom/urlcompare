import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getDatabaseConfig(): { url: string } {
  const url = process.env.DATABASE_URL ?? 'file:./db/database.sqlite'
  const match = url.match(/^file:(.+)$/)
  if (match) {
    const relativePath = match[1]
    return { url: join(process.cwd(), relativePath) }
  }
  return { url }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3(getDatabaseConfig()),
    log: process.env.PRISMA_DEBUG === 'true' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

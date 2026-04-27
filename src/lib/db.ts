import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getDatabasePath(): string {
  // DATABASE_URL format: "file:./db/custom.db" (relative to prisma directory)
  const url = process.env.DATABASE_URL ?? 'file:./db/database.sqlite'
  const match = url.match(/^file:(.+)$/)
  if (match) {
    const relativePath = match[1]
    // Resolve relative to the prisma directory
    const { join } = require('path')
    return join(process.cwd(), 'prisma', relativePath)
  }
  return url
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3(getDatabasePath()),
    log: process.env.PRISMA_DEBUG === 'true' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

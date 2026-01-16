import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

// Check if database exists and initialize if needed
function ensureDatabaseExists() {
  if (globalForPrisma.dbInitialized) {
    return
  }

  // The database path is relative to the prisma folder
  const dbPath = join(process.cwd(), 'prisma', 'db', 'custom.db')

  if (!existsSync(dbPath)) {
    console.log('🚀 Database not found. Initializing with prisma db push...')
    try {
      execSync('npx prisma db push', {
        cwd: process.cwd(),
        stdio: 'inherit',
      })
      console.log('✅ Database initialized successfully!')
    } catch (error) {
      console.error('❌ Failed to initialize database:', error)
      throw error
    }
  }

  globalForPrisma.dbInitialized = true
}

// Ensure database exists before creating the client
ensureDatabaseExists()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
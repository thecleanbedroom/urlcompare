-- CreateTable
CREATE TABLE "ComparisonJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sourceUrls" TEXT NOT NULL,
    "newDomain" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalUrls" INTEGER NOT NULL DEFAULT 0,
    "completedUrls" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sourceDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "maxPages" INTEGER NOT NULL DEFAULT 500,
    "maxDepth" INTEGER NOT NULL DEFAULT 10,
    "delayMs" INTEGER NOT NULL DEFAULT 200,
    "includePatterns" TEXT,
    "excludePatterns" TEXT,
    "discoveredUrls" TEXT,
    "totalDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesVisited" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UrlResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "newUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "redirectChain" TEXT,
    "finalUrl" TEXT,
    "result" TEXT NOT NULL,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UrlResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ComparisonJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrawlJob_status_idx" ON "CrawlJob"("status");

-- CreateIndex
CREATE INDEX "CrawlJob_createdAt_idx" ON "CrawlJob"("createdAt");

-- CreateIndex
CREATE INDEX "UrlResult_jobId_idx" ON "UrlResult"("jobId");

-- CreateIndex
CREATE INDEX "UrlResult_result_idx" ON "UrlResult"("result");


-- CreateTable
CREATE TABLE "DiscoveryJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sourceDomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sources" TEXT NOT NULL,
    "maxPages" INTEGER NOT NULL DEFAULT 10000,
    "maxDepth" INTEGER NOT NULL DEFAULT 20,
    "delayMs" INTEGER NOT NULL DEFAULT 200,
    "includePatterns" TEXT,
    "excludePatterns" TEXT,
    "queryPolicy" TEXT NOT NULL DEFAULT 'ignore',
    "queryAllowKeys" TEXT,
    "queryDenyKeys" TEXT,
    "normalizeQuery" BOOLEAN NOT NULL DEFAULT true,
    "ignoreAnchors" BOOLEAN NOT NULL DEFAULT true,
    "pagesVisited" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UrlSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UrlSet_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DiscoveryJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveredUrl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "urlSetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DiscoveredUrl_urlSetId_fkey" FOREIGN KEY ("urlSetId") REFERENCES "UrlSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" DATETIME,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ComparisonJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "sourceUrls" TEXT NOT NULL,
    "newDomain" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalUrls" INTEGER NOT NULL DEFAULT 0,
    "completedUrls" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "urlSetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComparisonJob_urlSetId_fkey" FOREIGN KEY ("urlSetId") REFERENCES "UrlSet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ComparisonJob" ("completedUrls", "config", "createdAt", "id", "lastError", "name", "newDomain", "sourceUrls", "status", "totalUrls", "updatedAt") SELECT "completedUrls", "config", "createdAt", "id", "lastError", "name", "newDomain", "sourceUrls", "status", "totalUrls", "updatedAt" FROM "ComparisonJob";
DROP TABLE "ComparisonJob";
ALTER TABLE "new_ComparisonJob" RENAME TO "ComparisonJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DiscoveryJob_status_idx" ON "DiscoveryJob"("status");

-- CreateIndex
CREATE INDEX "DiscoveryJob_createdAt_idx" ON "DiscoveryJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UrlSet_jobId_key" ON "UrlSet"("jobId");

-- CreateIndex
CREATE INDEX "DiscoveredUrl_urlSetId_idx" ON "DiscoveredUrl"("urlSetId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredUrl_urlSetId_url_key" ON "DiscoveredUrl"("urlSetId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCredential_provider_key" ON "OAuthCredential"("provider");


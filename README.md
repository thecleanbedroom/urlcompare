# urlCompare

Migration QA tool — verify that every URL on an old site resolves correctly on a new domain. Discover a site's URLs (link crawl, sitemap.xml, Google Search Console), review the merged set, then compare every path against the new domain and inspect per-URL verdicts, redirect chains, and summaries.

An npm-workspaces monorepo:

```
apps/web              Next.js frontend — proxies /api/* to the API server
packages/api-server   Hono REST API + MCP HTTP mount + job runners (SQLite/Prisma)
packages/mcp-server   MCP tool surface — Streamable HTTP (via api-server) + stdio
packages/shared-types Domain types, Zod schemas, UrlCompareService interface
packages/shared-logic URL checker, crawler, sitemap, GSC, canonicalization, export
```

## Quick start

```bash
npm install

# terminal 1 — API on :3001
npm run dev:api

# terminal 2 — web on :3000
npm run dev:web
```

Open http://localhost:3000 — the web UI proxies `/api/*` to the API server automatically.

## Usage flow

1. **Discover** — enter the old domain, pick sources (crawl / sitemap / Search Console), tune query-string policy and limits. A discovery job runs in the background and produces a URL set.
2. **Review** — toggle which discovered URLs are included, or add manual URLs.
3. **Compare** — run the set (or a pasted URL list) against the new domain. Each source path is checked on the new domain: `OK` / `Redirected` / `Missing` / `Error`.
4. **Inspect / export** — filter results, retry failures, export CSV/JSON/HTML.

## MCP server

The API server mounts a stateless Streamable HTTP MCP endpoint at **`POST /mcp`** (same port, same API-key middleware). It's also proxied through the web app — `POST http://localhost:3000/mcp` works too. Tools: `discover_urls`, `list_discovered_urls`, `update_url_set`, `start_comparison`, `get_job_status`, `get_comparison_report`, `check_url`, `cancel_job`, `list_jobs`. Resources: `urlcompare://urlsets{,/{id}}`, `urlcompare://jobs`.

Stdio transport (for local agents — talks REST to a running API):

```bash
URLCOMPARE_API_URL=http://localhost:3001 npm run stdio --workspace=mcp-server
```

The tool surface is spec-driven: `packages/mcp-server/spec/urlcompare.py` → `generated/*` via the MCP toolkit (`mcp-toolkit validate|generate|eval`).

## Configuration (api-server `.env`)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite location |
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Bind address |
| `API_KEY` | — | Bearer auth for `/api/*` and `/mcp` |
| `ALLOWED_ORIGINS` | `*` | CORS |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Search Console OAuth |
| `GOOGLE_REDIRECT_URI` | `…:3001/api/auth/google/callback` | OAuth callback |
| `WEB_URL` | `http://localhost:3000` | Post-OAuth redirect |

Web reads `API_URL` (default `http://localhost:3001`) for its `/api/*` rewrite — **baked at build time**.

## Docker

```bash
docker compose up --build
```

Two services: `api` (runs `prisma migrate deploy`, then serves :3001 incl. `/mcp`, SQLite on the `db-data` volume) and `web` (:3000, rewrites to `api:3001`). Build contexts are the repo root.

## Database

Prisma migrations live in `packages/api-server/prisma/migrations` — apply with `npm run db:deploy --workspace=api-server` (production) or `db:migrate` (dev). `scripts/migrate-legacy.ts` converts pre-monorepo `CrawlJob` rows into discovery jobs + URL sets.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev:api` / `dev:web` | Dev servers (api :3001, web :3000) |
| `npm test` | Vitest across workspaces |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm run build:api` | esbuild bundle → `dist/server.mjs` |
| `npm run lint:web` | ESLint on the web app |

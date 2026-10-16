All six stages of the monorepo overhaul are complete and committed. Final state:

## Where things landed

**Stage 4** (`5677a8d`) — Discovery rework: `DiscoveryJob`/`UrlSet`/`DiscoveredUrl`/`OAuthCredential` schema with baseline + delta migrations, canonicalization + query policies, sitemap + GSC sources, Google OAuth2 routes, URL-set editing, and the full web UI flow (source checkboxes → discovery → URL checklist with include toggles → comparison by `urlSetId`).

**Stage 5** (`efbccd2`, `9ec006d`) — `packages/mcp-server`: spec-driven surface — 9 tools, 3 resources, structured error contract. The `urlcompare-mcp-tools.json` artifact is the canonical ListTools payload; `handlers.ts` maps args onto the `UrlCompareService` interface (in-process impl for HTTP, REST client impl for stdio). Both transports verified live: `POST /mcp` on the API and stdio → REST → real DB.

**Stage 6** (`644e3da`) — Root `docker-compose` (api + web), production Dockerfiles, `prisma migrate deploy` at container start, README rewrite, `AGENTS.md`, and cleanup: untracked DB artifacts, removed `ignoreBuildErrors`, deleted the unused `chart.tsx`/`resizable.tsx` — lint and tsc are fully clean for the first time.

## Routing eval

Ran the toolkit's OpenRouter eval twice and iterated: **43.8% → 90.6%**. `list_jobs` was hogging everything because its description advertised poll/report/cancel intents. Remaining misses are rational first-calls (fetching `urlIds` before toggling; summary overlap between status/report tools).

## Verified end-to-end

- Docker compose stack: web :3000 → rewrite → api :3001 → migrate deploy → real `check_url` through `/mcp` inside the container
- 101 tests green (82 shared-logic + 12 api + 7 mcp), all typechecks clean

## Open items (documented, not blocking)

- `CrawlJob` table still in schema — drop it via follow-up migration once `migrate-legacy.ts` has run against real data (dev db had 0 legacy rows)
- Google OAuth flow is coded but unverified end-to-end — needs real Google Cloud credentials
- mcp-server `bin` targets `dist/stdio.mjs` (run `npm run bundle` in mcp-server if you need the compiled stdio entry; dev works via `npm run stdio`)

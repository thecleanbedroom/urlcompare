## MCP Server — urlCompare — URL Migration Checker

URL migration QA server: discover a site's URLs (crawl, sitemap, Google Search Console), review the merged URL set, then compare every path against a new domain and inspect per-URL verdicts (OK / Redirected / Missing / Error), redirect chains, and summaries.

### Quick Start

Add to your MCP client configuration:

```json
{
  "urlcompare": {
    "command": "node",
    "args": ["packages/mcp-server/dist/server.js"]
  }
}
```

### Tools (9)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `discover_urls` | Start a discovery job that finds a site's URLs from one or more sources (link crawl, sitemap.xml, Google Search Console) and stores the merged, deduplicated, canonicalized result as a reviewable URL set. | 1 required, 10 optional |
| `list_discovered_urls` | Read the canonicalized URLs in a URL set — the merged output of a discovery job — with per-URL source attribution and included flags. | 1 required, 2 optional |
| `update_url_set` | Toggle whether individual URLs in a set are included in future comparisons, and/or add manual URLs to the set. | 1 required, 2 optional |
| `start_comparison` | Start a comparison job that checks every source URL's path on the new domain — recording status codes, redirect chains, and a final verdict (OK / Redirected / Missing / Error) per URL. | 1 required, 7 optional |
| `get_job_status` | Poll the progress of a discovery or comparison job — status, completion counts, and (for discoveries) the produced url_set_id. | 1 required, 1 optional |
| `get_comparison_report` | Return the full results of a comparison job — per-URL verdicts, status codes, redirect chains — plus the ok/redirected/missing/error summary. | 1 required, 2 optional |
| `check_url` | Synchronously check one source URL's path on a new domain and return the verdict — status code, redirect chain, final URL, and OK/Redirected/Missing/Error result. | 2 required, 1 optional |
| `cancel_job` | Cancel a running or pending discovery/comparison job, stopping further work. | 1 required, 1 optional |
| `list_jobs` | Browse the history of recent discovery and comparison jobs — their ids, names, statuses, and targets — when no specific job is known. | 0 required, 1 optional |

### Tool Reference

### discover_urls

**Purpose:** Start a discovery job that finds a site's URLs from one or more sources (link crawl, sitemap.xml, Google Search Console) and stores the merged, deduplicated, canonicalized result as a reviewable URL set.

**When to use:** When the user wants to enumerate a website's pages before a migration comparison — 'crawl this site', 'what URLs does example.com have', 'find all pages under the old domain'. The job is asynchronous: it returns a job_id immediately; poll get_job_status, then read the produced URL set.

**When NOT to use:** Do not use to check whether URLs work on the NEW domain — that is start_comparison. Do not use when the user already has an explicit URL list — pass source_urls to start_comparison directly.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source_domain` | string | yes | Absolute http(s) URL of the site to discover URLs on, e.g. 'https://old-site.com'. |
| `sources` | array | no | Discovery sources to run: 'crawl' (link-following BFS), 'sitemap' (sitemap.xml incl. robots.txt discovery), 'gsc' (Search Console impressions). Default ['crawl','sitemap']. Default: ['crawl', 'sitemap']. |
| `name` | string | no | Optional human-readable label for the job/URL set. |
| `max_pages` | integer | no | Max pages the crawler visits (1-50000). Default 10000. Default: 10000. |
| `max_depth` | integer | no | Max link depth for the crawl source (1-1000). Default 20. Default: 20. |
| `include_patterns` | array | no | Optional glob patterns — only matching URLs are kept (e.g. ['*/docs/*']). Evaluated after excludes. |
| `exclude_patterns` | array | no | Optional glob patterns — matching URLs are dropped first (e.g. ['*/wp-admin/*', '*.pdf']). |
| `query_policy` | string | no | How to treat query strings when canonicalizing: 'ignore' strips them (default), 'allow' keeps only query_allow_keys, 'deny' drops query_deny_keys. Default: ignore. Values: ignore, allow, deny. |
| `query_allow_keys` | array | no | Query keys to keep when query_policy='allow' (e.g. ['page','lang']). |
| `query_deny_keys` | array | no | Query keys to drop when query_policy='deny' (e.g. ['utm_source','fbclid']). |
| `ignore_anchors` | boolean | no | Strip #fragments when canonicalizing URLs. Default true. Default: True. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Discovery job id — poll get_job_status, then read the url_set_id from the completed job. |
| `status` | string | Initial job status ('pending' or 'running'). |

**Edge cases:**

- sources accepts any non-empty subset of ['crawl','sitemap','gsc']; results merge across sources with per-URL source attribution.
- GSC only returns pages that received impressions — it is not exhaustive and needs a connected Google account (see gsc_not_connected).
- query_policy defaults to 'ignore' (strip query strings). 'allow' keeps only query_allow_keys; 'deny' drops query_deny_keys — pass the key list in the matching field.
- max_depth defaults to 20; values above ~100 can run for a very long time on large sites.
- Completed jobs produce a url_set_id (visible via get_job_status); read URLs via list_discovered_urls or the urlcompare://urlsets/{id} resource.

**Error behavior:** 400-style structured errors: invalid_input for malformed domains or empty sources, url_blocked for private/non-http domains, gsc_not_connected or gsc_no_property when the GSC source is requested without a working connection.

**Example queries:**

- "Crawl https://old-site.com and list its pages"
- "What URLs does my blog have? Use the sitemap"
- "Discover all pages on https://example.org via sitemap and crawl"
- "Find the URLs on my site using Search Console"
- "Scan old-site.com but skip the /wp-admin/ paths"

---

### list_discovered_urls

**Purpose:** Read the canonicalized URLs in a URL set — the merged output of a discovery job — with per-URL source attribution and included flags.

**When to use:** When the user asks to see the URLs a discovery found — 'show me the URLs the crawl found', 'what's in the URL set', 'which URLs will be compared', 'list the discovered urls'. Provide the url_set_id (from get_job_status on a completed discovery job, or the urlcompare://urlsets resource).

**When NOT to use:** Do not use for comparison RESULTS — get_comparison_report. Do not use to browse jobs — list_jobs. Do not use to change which URLs are included — update_url_set.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url_set_id` | string | yes | The URL set id (from a completed discovery job or the urlcompare://urlsets resource). |
| `limit` | integer | no | Max URLs to return (1-2000). Default 500. Default: 500. |
| `offset` | integer | no | Skip this many URLs for pagination. Default 0. Default: 0. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total URLs in the set. |
| `urls` | array | URL rows: {id, url, sources, included}. |
| `url_set` | object | Set metadata: id, name, sourceDomain, urlCount, createdAt. |

**Edge cases:**

- Returns up to `limit` urls (default 500, max 2000) plus a `total` count — page with offset for large sets.
- Each url carries `sources` (which of crawl/sitemap/gsc/manual contributed it) and `included` (whether it feeds comparisons).
- Urls are canonicalized — query policy and fragment stripping were already applied at discovery time.

**Error behavior:** not_found when the url_set_id does not exist.

**Example queries:**

- "Show me the URLs in set cm0abc123def456"
- "What pages did the discovery job find? The set id is cm0abc123"
- "List the urls in URL set cm0abc123"
- "Which URLs in set cm0abc123 are included?"
- "Give me the first 100 urls of set cm0abc123"

---

### update_url_set

**Purpose:** Toggle whether individual URLs in a set are included in future comparisons, and/or add manual URLs to the set.

**When to use:** When the user wants to EDIT which URLs are in a comparison set — 'exclude these urls', 'don't include the admin pages', 'add this url to the set', 'mark that URL excluded', 'remove the feed urls'. Toggles take effect on the NEXT comparison — running jobs already snapshotted their URL list.

**When NOT to use:** Do not use to create a new URL set — that only happens via discover_urls. Do not use to change an in-flight comparison's URL list — that's fixed at start_comparison time.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `url_set_id` | string | yes | The URL set to modify. |
| `included` | array | no | Inclusion toggles: [{urlId: string, included: boolean}]. |
| `add_manual_urls` | array | no | Absolute URLs to add to the set with source 'manual' (canonicalized first). |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total URLs in the set after the update. |
| `urls` | array | Updated URL rows. |

**Edge cases:**

- included takes [{urlId, included}] pairs — get urlIds from list_discovered_urls.
- add_manual_urls are canonicalized with the set's original query policy and merge into existing rows (adding 'manual' to sources) on collision.
- Excluding URLs does not delete them — they stay in the set with included=false.

**Error behavior:** not_found when the url_set_id does not exist; invalid_input for malformed manual URLs.

**Example queries:**

- "Exclude url cm0x1 from set cm0abc123"
- "Add https://old-site.com/hidden-page to URL set cm0abc123"
- "Don't include the /feed/ urls — toggle them off in set cm0abc123"
- "Mark url cm0x1 as excluded"
- "Add these two pages to set cm0abc123 manually"

---

### start_comparison

**Purpose:** Start a comparison job that checks every source URL's path on the new domain — recording status codes, redirect chains, and a final verdict (OK / Redirected / Missing / Error) per URL.

**When to use:** When the user wants to verify MANY URLs or a whole URL set against a new domain — 'do all these old URLs exist on the new site', 'check the migration', 'test the discovered set against staging', 'verify these URLs resolve', 'run the comparison'. Either url_set_id (a discovered set — its included URLs are snapshotted) or source_urls (ad-hoc list) is required, plus new_domain.

**When NOT to use:** Do not use to check a single URL — use check_url. Do not use to find a site's URLs — use discover_urls first.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `new_domain` | string | yes | Absolute http(s) URL of the new domain to check paths against, e.g. 'https://new-site.com'. |
| `url_set_id` | string | no | URL set whose included URLs are compared (mutually exclusive with source_urls). |
| `source_urls` | array | no | Ad-hoc list of absolute source URLs (mutually exclusive with url_set_id). |
| `name` | string | no | Optional human-readable label for the job. |
| `follow_redirects` | boolean | no | Follow redirect chains to the final URL. Default true. Default: True. |
| `max_concurrency` | integer | no | Parallel checks (1-50). Default 10. Default: 10. |
| `retry_attempts` | integer | no | Retries per failing URL (0-10). Default 3. Default: 3. |
| `timeout_seconds` | integer | no | Per-request timeout (1-60s). Default 10. Default: 10. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | Comparison job id for polling/report. |
| `total_urls` | integer | How many URLs will be checked. |

**Edge cases:**

- Exactly one of url_set_id or source_urls must be given (conflicting_params otherwise).
- The job is asynchronous — returns job_id + total_urls immediately; poll get_job_status, then get_comparison_report.
- url_set_id mode snapshots the set's currently-included URLs — later toggles do not affect this job.
- Comparison checks the PATH of each source URL on the new domain (e.g. old.com/about → new.com/about).

**Error behavior:** conflicting_params for both/neither URL inputs, url_blocked for private addresses, no_included_urls for an empty set, not_found for an unknown url_set_id.

**Example queries:**

- "Compare URL set cm0abc123 against https://new-site.com"
- "Check if the urls in set cm0abc123 work on staging.example.com"
- "Compare https://old.com/a and https://old.com/b to https://new-site.com"
- "Run the migration check on set cm0abc123 against the new domain"
- "Start a comparison of these urls to https://new-site.com: https://a.com, https://a.com/x"

---

### get_job_status

**Purpose:** Poll the progress of a discovery or comparison job — status, completion counts, and (for discoveries) the produced url_set_id.

**When to use:** When the user asks whether a job is finished, still running, or how far along it is — 'is the crawl done', 'check the job status', how many URLs have been checked so far. Poll after discover_urls or start_comparison returns a job_id.

**When NOT to use:** Do not use for the actual results or verdicts — get_comparison_report returns per-URL outcomes. Do not use to browse all jobs — list_jobs. Do not use to stop a job — cancel_job.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `job_id` | string | yes | The job id returned by discover_urls or start_comparison. |
| `kind` | string | no | Job kind: 'comparison' or 'discovery'. Default auto-detect. Values: comparison, discovery. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | pending | running | completed | failed | cancelled. |
| `progress` | object | {completed, total} for comparisons. |
| `url_set_id` | string | Produced URL set (discovery only). |
| `summary` | object | Result counts {totalUrls, ok, redirected, missing, error} for comparisons. |

**Edge cases:**

- kind defaults to auto-detect (tries comparison, then discovery) — pass it explicitly to disambiguate.
- status values: pending, running, completed, failed, cancelled.
- A completed discovery exposes url_set_id + url_count; a completed comparison exposes a result summary (ok/redirected/missing/error counts).

**Error behavior:** not_found when no job with that id exists (in either kind when auto-detecting).

**Example queries:**

- "Is job cm0abc123 finished yet?"
- "What's the status of job cm0abc123?"
- "How far along is comparison job cm0abc123?"
- "Check if discovery job cm0abc123 is done"
- "Did the comparison cm0abc123 complete?"

---

### get_comparison_report

**Purpose:** Return the full results of a comparison job — per-URL verdicts, status codes, redirect chains — plus the ok/redirected/missing/error summary.

**When to use:** When the user asks for the RESULTS of a comparison — 'show me the results', 'which URLs failed/are missing', 'the migration report', 'how many 404s', 'list the redirects'. Returns per-URL verdicts plus the ok/redirected/missing/error summary counts.

**When NOT to use:** Do not use for job progress or whether it finished — get_job_status. Do not use for the URLs a DISCOVERY found — list_discovered_urls.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `job_id` | string | yes | The comparison job id. |
| `limit` | integer | no | Max result rows to return (1-5000). Default 500. Default: 500. |
| `offset` | integer | no | Skip this many rows for pagination. Default 0. Default: 0. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `summary` | object | {totalUrls, ok, redirected, missing, error}. |
| `results` | array | Per-URL rows: {sourceUrl, newUrl, statusCode, result, finalUrl, redirectChain, error}. |
| `total_results` | integer | Total result rows in the job. |
| `job` | object | Job metadata: id, name, newDomain, status. |

**Edge cases:**

- Results are capped (default 500, max 5000) — page with offset; total_results gives the real count.
- Per-URL result values: 'OK' (2xx on new domain), 'Redirected' (ended elsewhere), 'Missing' (404/410), 'Error' (network/other failure).
- redirect_chain lists the hops followed; final_url is where the check landed.
- For a downloadable file (json/csv/html), the web UI's export endpoint is the better fit — this returns structured data.

**Error behavior:** not_found for an unknown job_id; job_not_completed if the job failed or was cancelled.

**Example queries:**

- "Show me the results of comparison job cm0abc123"
- "Which URLs are missing in job cm0abc123?"
- "Give me the migration report for job cm0abc123"
- "How many pages returned 404 in job cm0abc123?"
- "List all the redirected URLs from job cm0abc123"

---

### check_url

**Purpose:** Synchronously check one source URL's path on a new domain and return the verdict — status code, redirect chain, final URL, and OK/Redirected/Missing/Error result.

**When to use:** For one-off spot checks — 'does old-site.com/pricing exist on the new domain', 'verify this URL before the launch'. Returns immediately with the verdict; no job is created.

**When NOT to use:** Do not use when there is more than one URL or the user refers to a set/list/collection of URLs ('these URLs', 'the set', 'all the URLs') — that is start_comparison. Do not use to enumerate site URLs — discover_urls.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `source_url` | string | yes | Absolute http(s) URL whose path is checked on the new domain. |
| `new_domain` | string | yes | Absolute http(s) new domain, e.g. 'https://new-site.com'. |
| `follow_redirects` | boolean | no | Follow redirect chains. Default true. Default: True. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `result` | string | OK | Redirected | Missing | Error. |
| `status_code` | integer | HTTP status of the first (or final) response. |
| `new_url` | string | The URL actually checked on the new domain. |
| `final_url` | string | Where the check ended after redirects. |
| `redirect_chain` | array | Ordered list of redirect hops. |

**Edge cases:**

- The check is on the PATH: sourceUrl 'https://old.com/a/b?x=1' checks 'newDomain + /a/b?x=1'.
- result 'Redirected' means the new URL answered but redirected elsewhere; the hops are in redirect_chain.
- follow_redirects=false returns the first response's status code only.

**Error behavior:** url_blocked for private/non-http addresses; invalid_input for malformed URLs.

**Example queries:**

- "Does https://old.com/pricing exist on the new site?"
- "Check this one URL against https://new-site.com"
- "Quick spot-check: does /about/team work on the new domain?"
- "Verify old-site.com/contact resolves on staging"

---

### cancel_job

**Purpose:** Cancel a running or pending discovery/comparison job, stopping further work.

**When to use:** When the user wants to STOP or CANCEL a job — 'cancel the crawl', 'stop the comparison', 'kill that job', 'abort the discovery'. Only affects pending/running jobs; completed/failed jobs are untouched.

**When NOT to use:** Do not use to delete job records — cancellation stops work but keeps the job's results. Do not use for finished jobs (no-op).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `job_id` | string | yes | The job to cancel. |
| `kind` | string | no | 'comparison' or 'discovery'. Default auto-detect. Values: comparison, discovery. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | 'cancelled' on success. |

**Edge cases:**

- kind defaults to auto-detect; pass it when the job kind is known.
- Cancellation is asynchronous — the job status flips to 'cancelled' once the runner observes the abort signal.

**Error behavior:** not_found for an unknown job_id.

**Example queries:**

- "Cancel job cm0abc123"
- "Stop comparison job cm0abc123"
- "Kill job cm0abc123, it's taking too long"
- "Abort discovery job cm0abc123"

---

### list_jobs

**Purpose:** Browse the history of recent discovery and comparison jobs — their ids, names, statuses, and targets — when no specific job is known.

**When to use:** Only when the user asks 'what jobs have run', 'show recent activity', or needs to DISCOVER a job_id they don't already have. This is a browsing tool — it returns a list, not a specific job's details.

**When NOT to use:** Do not use when the user wants to: check a specific job's progress or whether it finished (get_job_status), see a comparison's results or which URLs failed (get_comparison_report), stop or cancel a job (cancel_job), see the URLs a discovery found (list_discovered_urls), or modify a URL set (update_url_set). Those tools take the job_id directly — never call list_jobs first when the id or intent is already known.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `kind` | string | no | Filter by job kind: 'comparison' or 'discovery'. Default: both. Values: comparison, discovery. |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `jobs` | array | [{id, name, kind, status, target, createdAt, detail}]. |

**Edge cases:**

- Returns up to 100 most recent jobs, newest first, with kind tags.
- detail field gives a one-line progress hint (e.g. '12/40 checked', '213 urls found').

**Error behavior:** None beyond internal_error — never fails on valid input.

**Example queries:**

- "What jobs have I run?"
- "List all comparisons"
- "Show recent discovery jobs"
- "Any jobs still running?"
- "Find the job id for my last crawl"

---

### Resources (3)

| Resource | URI | Description |
|----------|-----|-------------|
| `url-sets` | `urlcompare://urlsets` | All URL sets — discovered via discover_urls or created in the web UI — with url counts and source domains. Read urlcompare://urlsets/{id} for a set's URLs, or pass its id to update_url_set / start_comparison. |
| `url-set` | `urlcompare://urlsets/{url_set_id}` | The URLs in one set — canonicalized, with per-URL sources (crawl/sitemap/gsc/manual) and included flags. |
| `jobs` | `urlcompare://jobs` | Recent discovery and comparison jobs with statuses — a read-only activity feed for finding job ids. |

"""urlCompare — canonical MCP tool surface specification.

urlCompare verifies that every URL on an old site resolves correctly on a
new domain (migration QA). Workflow: discover URLs (crawl / sitemap /
Search Console) into a URL set, review/edit it, run a comparison job that
checks each source path against the new domain, then inspect or export
the results.

Design decisions (per docs/agent-workflow.md and mcp-build-framework.md):
  - Source surface = the UrlCompareService interface (api-server services),
    consumed by adapters — MCP does not re-implement business logic.
  - health dropped — infrastructure, not user intent.
  - verify/update-result endpoint folded into check_url (stateless single
    check is the intent; persistence is a detail of the web UI flow).
  - Pagination params (limit/offset) absorbed into tools with sane caps —
    the model asks for "the urls in this set", not "page 3".
  - Job creation is asynchronous everywhere: discover_urls and
    start_comparison return a jobId immediately; get_job_status polls.
    This matches the app's durable job model rather than faking
    synchronous answers over slow crawls.
  - gsc_not_connected is a first-class error code with a recovery hint —
    stdio clients can't do OAuth, so the hint points at the web UI.
  - URL sets are MCP Resources (reference data) as well as tool outputs —
    urlcompare://urlsets lists them, urlcompare://urlsets/{id} reads one.
"""

from mcp_toolkit.models import (
    ErrorCode,
    ErrorContract,
    OutputFieldSpec,
    ParameterSpec,
    ResourceSpec,
    ServerSpec,
    ToolSpec,
)

# ── Error contract ───────────────────────────────────────────────────────────

error_contract = ErrorContract(
    codes=[
        ErrorCode(
            code="invalid_input",
            message_template="Input validation failed: {detail}.",
            recovery_hint=(
                "Fix the parameter described in 'detail'. URLs must be "
                "absolute http(s) URLs; sources must be a non-empty subset "
                "of ['crawl', 'sitemap', 'gsc']."
            ),
        ),
        ErrorCode(
            code="url_blocked",
            message_template="URL '{url}' is blocked: {reason}. Private, loopback, link-local, and non-http(s) addresses are not allowed.",
            recovery_hint=(
                "Use a public http(s) URL. This tool never fetches "
                "localhost, private IPs (10/8, 172.16/12, 192.168/16, "
                "169.254/16), or non-web schemes."
            ),
        ),
        ErrorCode(
            code="not_found",
            message_template="{resource} '{id}' was not found.",
            recovery_hint=(
                "Call list_jobs (for jobs) or read urlcompare://urlsets "
                "(for URL sets) to discover valid ids."
            ),
        ),
        ErrorCode(
            code="gsc_not_connected",
            message_template="Google Search Console is not connected.",
            recovery_hint=(
                "OAuth must be completed in the browser: open the urlCompare "
                "web UI, enable the Search Console source, and click "
                "'Connect Google'. Then retry — stdio MCP cannot initiate "
                "OAuth itself."
            ),
        ),
        ErrorCode(
            code="gsc_no_property",
            message_template="No Search Console property covers {domain}.",
            recovery_hint=(
                "Verify the property in Google Search Console for the "
                "connected account (a sc-domain: or URL-prefix property "
                "covering the domain), or use sources=['crawl','sitemap'] "
                "instead."
            ),
        ),
        ErrorCode(
            code="conflicting_params",
            message_template="Exactly one of url_set_id or source_urls must be provided.",
            recovery_hint=(
                "Pass url_set_id to compare a discovered set, or "
                "source_urls for an ad-hoc list — never both."
            ),
        ),
        ErrorCode(
            code="no_included_urls",
            message_template="URL set '{url_set_id}' has no included URLs.",
            recovery_hint=(
                "Include at least one URL in the set (web UI URL checklist "
                "or update_url_set) before starting a comparison."
            ),
        ),
        ErrorCode(
            code="job_not_completed",
            message_template="Job '{job_id}' has status '{status}' — results are not final yet.",
            recovery_hint=(
                "Poll get_job_status until the job reaches 'completed'. "
                "Partial results may still be returned but are not final."
            ),
        ),
    ],
    default_code="internal_error",
    default_message="An unexpected internal error occurred.",
    default_recovery_hint="Retry once; if it persists, check the api-server logs.",
)


# ── Tool 1: discover_urls ────────────────────────────────────────────────────

discover_urls = ToolSpec(
    name="discover_urls",
    title="Discover URLs",
    purpose=(
        "Start a discovery job that finds a site's URLs from one or more "
        "sources (link crawl, sitemap.xml, Google Search Console) and stores "
        "the merged, deduplicated, canonicalized result as a reviewable URL set."
    ),
    when_to_use=(
        "When the user wants to enumerate a website's pages before a "
        "migration comparison — 'crawl this site', 'what URLs does "
        "example.com have', 'find all pages under the old domain'. The job "
        "is asynchronous: it returns a job_id immediately; poll "
        "get_job_status, then read the produced URL set."
    ),
    when_not_to_use=(
        "Do not use to check whether URLs work on the NEW domain — that is "
        "start_comparison. Do not use when the user already has an explicit "
        "URL list — pass source_urls to start_comparison directly."
    ),
    edge_cases=[
        "sources accepts any non-empty subset of ['crawl','sitemap','gsc']; results merge across sources with per-URL source attribution.",
        "GSC only returns pages that received impressions — it is not exhaustive and needs a connected Google account (see gsc_not_connected).",
        "query_policy defaults to 'ignore' (strip query strings). 'allow' keeps only query_allow_keys; 'deny' drops query_deny_keys — pass the key list in the matching field.",
        "max_depth defaults to 20; values above ~100 can run for a very long time on large sites.",
        "Completed jobs produce a url_set_id (visible via get_job_status); read URLs via list_discovered_urls or the urlcompare://urlsets/{id} resource.",
    ],
    error_behavior=(
        "400-style structured errors: invalid_input for malformed domains or "
        "empty sources, url_blocked for private/non-http domains, "
        "gsc_not_connected or gsc_no_property when the GSC source is "
        "requested without a working connection."
    ),
    parameters=[
        ParameterSpec(
            name="source_domain",
            type="string",
            description="Absolute http(s) URL of the site to discover URLs on, e.g. 'https://old-site.com'.",
            required=True,
            examples=["https://old-site.com", "https://blog.example.org"],
        ),
        ParameterSpec(
            name="sources",
            type="array",
            description="Discovery sources to run: 'crawl' (link-following BFS), 'sitemap' (sitemap.xml incl. robots.txt discovery), 'gsc' (Search Console impressions). Default ['crawl','sitemap'].",
            required=False,
            default=["crawl", "sitemap"],
            examples=[["crawl"], ["crawl", "sitemap"], ["sitemap", "gsc"]],
        ),
        ParameterSpec(
            name="name",
            type="string",
            description="Optional human-readable label for the job/URL set.",
            required=False,
            examples=["docs site pre-launch"],
        ),
        ParameterSpec(
            name="max_pages",
            type="integer",
            description="Max pages the crawler visits (1-50000). Default 10000.",
            required=False,
            default=10000,
            examples=[500, 10000],
        ),
        ParameterSpec(
            name="max_depth",
            type="integer",
            description="Max link depth for the crawl source (1-1000). Default 20.",
            required=False,
            default=20,
            examples=[5, 20, 50],
        ),
        ParameterSpec(
            name="include_patterns",
            type="array",
            description="Optional glob patterns — only matching URLs are kept (e.g. ['*/docs/*']). Evaluated after excludes.",
            required=False,
            examples=[["*/docs/*"], ["*.html"]],
        ),
        ParameterSpec(
            name="exclude_patterns",
            type="array",
            description="Optional glob patterns — matching URLs are dropped first (e.g. ['*/wp-admin/*', '*.pdf']).",
            required=False,
            examples=[["*/wp-admin/*", "*.pdf"], ["*/feed/*"]],
        ),
        ParameterSpec(
            name="query_policy",
            type="string",
            description="How to treat query strings when canonicalizing: 'ignore' strips them (default), 'allow' keeps only query_allow_keys, 'deny' drops query_deny_keys.",
            required=False,
            default="ignore",
            enum=["ignore", "allow", "deny"],
        ),
        ParameterSpec(
            name="query_allow_keys",
            type="array",
            description="Query keys to keep when query_policy='allow' (e.g. ['page','lang']).",
            required=False,
            examples=[["page", "lang"]],
        ),
        ParameterSpec(
            name="query_deny_keys",
            type="array",
            description="Query keys to drop when query_policy='deny' (e.g. ['utm_source','fbclid']).",
            required=False,
            examples=[["utm_source", "fbclid", "gclid"]],
        ),
        ParameterSpec(
            name="ignore_anchors",
            type="boolean",
            description="Strip #fragments when canonicalizing URLs. Default true.",
            required=False,
            default=True,
        ),
    ],
    output_fields=[
        OutputFieldSpec(
            name="job_id",
            type="string",
            description="Discovery job id — poll get_job_status, then read the url_set_id from the completed job.",
        ),
        OutputFieldSpec(
            name="status",
            type="string",
            description="Initial job status ('pending' or 'running').",
        ),
    ],
    trust_justification=(
        "network enumeration — crawling links, parsing sitemap XML, and "
        "querying the Search Console API require live HTTP access the model "
        "does not have. The tool also applies canonicalization/dedup rules "
        "the model could not replicate consistently at scale."
    ),
    example_phrasings=[
        "Crawl https://old-site.com and list its pages",
        "What URLs does my blog have? Use the sitemap",
        "Discover all pages on https://example.org via sitemap and crawl",
        "Find the URLs on my site using Search Console",
        "Scan old-site.com but skip the /wp-admin/ paths",
        "Enumerate pages under https://docs.example.com, max depth 5",
        "Discover this site, strip query strings, ignore fragments",
        "Build me a URL list for example.com before the migration",
    ],
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=True,
)


# ── Tool 2: list_discovered_urls ─────────────────────────────────────────────

list_discovered_urls = ToolSpec(
    name="list_discovered_urls",
    title="List Discovered URLs",
    purpose="Read the canonicalized URLs in a URL set — the merged output of a discovery job — with per-URL source attribution and included flags.",
    when_to_use=(
        "When the user asks to see the URLs a discovery found — 'show me "
        "the URLs the crawl found', 'what's in the URL set', 'which URLs "
        "will be compared', 'list the discovered urls'. Provide the "
        "url_set_id (from get_job_status on a completed discovery job, or "
        "the urlcompare://urlsets resource)."
    ),
    when_not_to_use=(
        "Do not use for comparison RESULTS — get_comparison_report. Do not "
        "use to browse jobs — list_jobs. Do not use to change which URLs "
        "are included — update_url_set."
    ),
    edge_cases=[
        "Returns up to `limit` urls (default 500, max 2000) plus a `total` count — page with offset for large sets.",
        "Each url carries `sources` (which of crawl/sitemap/gsc/manual contributed it) and `included` (whether it feeds comparisons).",
        "Urls are canonicalized — query policy and fragment stripping were already applied at discovery time.",
    ],
    error_behavior="not_found when the url_set_id does not exist.",
    parameters=[
        ParameterSpec(
            name="url_set_id",
            type="string",
            description="The URL set id (from a completed discovery job or the urlcompare://urlsets resource).",
            required=True,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="limit",
            type="integer",
            description="Max URLs to return (1-2000). Default 500.",
            required=False,
            default=500,
            examples=[100, 500, 2000],
        ),
        ParameterSpec(
            name="offset",
            type="integer",
            description="Skip this many URLs for pagination. Default 0.",
            required=False,
            default=0,
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="total", type="integer", description="Total URLs in the set."),
        OutputFieldSpec(name="urls", type="array", description="URL rows: {id, url, sources, included}."),
        OutputFieldSpec(name="url_set", type="object", description="Set metadata: id, name, sourceDomain, urlCount, createdAt."),
    ],
    trust_justification=(
        "state lookup — the URL set lives in the app's database; the model "
        "has no access to discovered URLs without this read."
    ),
    example_phrasings=[
        "Show me the URLs in set cm0abc123def456",
        "What pages did the discovery job find? The set id is cm0abc123",
        "List the urls in URL set cm0abc123",
        "Which URLs in set cm0abc123 are included?",
        "Give me the first 100 urls of set cm0abc123",
    ],
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Tool 3: update_url_set ───────────────────────────────────────────────────

update_url_set = ToolSpec(
    name="update_url_set",
    title="Update URL Set",
    purpose="Toggle whether individual URLs in a set are included in future comparisons, and/or add manual URLs to the set.",
    when_to_use=(
        "When the user wants to EDIT which URLs are in a comparison set — "
        "'exclude these urls', 'don't include the admin pages', 'add this "
        "url to the set', 'mark that URL excluded', 'remove the feed "
        "urls'. Toggles take effect on the NEXT comparison — running jobs "
        "already snapshotted their URL list."
    ),
    when_not_to_use=(
        "Do not use to create a new URL set — that only happens via "
        "discover_urls. Do not use to change an in-flight comparison's "
        "URL list — that's fixed at start_comparison time."
    ),
    edge_cases=[
        "included takes [{urlId, included}] pairs — get urlIds from list_discovered_urls.",
        "add_manual_urls are canonicalized with the set's original query policy and merge into existing rows (adding 'manual' to sources) on collision.",
        "Excluding URLs does not delete them — they stay in the set with included=false.",
    ],
    error_behavior="not_found when the url_set_id does not exist; invalid_input for malformed manual URLs.",
    parameters=[
        ParameterSpec(
            name="url_set_id",
            type="string",
            description="The URL set to modify.",
            required=True,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="included",
            type="array",
            description="Inclusion toggles: [{urlId: string, included: boolean}].",
            required=False,
            examples=[[{"urlId": "cm0x1", "included": False}]],
        ),
        ParameterSpec(
            name="add_manual_urls",
            type="array",
            description="Absolute URLs to add to the set with source 'manual' (canonicalized first).",
            required=False,
            examples=[["https://old-site.com/hidden-page"]],
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="total", type="integer", description="Total URLs in the set after the update."),
        OutputFieldSpec(name="urls", type="array", description="Updated URL rows."),
    ],
    trust_justification=(
        "state mutation — inclusion flags and manual URLs persist in the "
        "app's database; the model cannot edit them directly."
    ),
    example_phrasings=[
        "Exclude url cm0x1 from set cm0abc123",
        "Add https://old-site.com/hidden-page to URL set cm0abc123",
        "Don't include the /feed/ urls — toggle them off in set cm0abc123",
        "Mark url cm0x1 as excluded",
        "Add these two pages to set cm0abc123 manually",
    ],
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Tool 4: start_comparison ─────────────────────────────────────────────────

start_comparison = ToolSpec(
    name="start_comparison",
    title="Start Comparison",
    purpose=(
        "Start a comparison job that checks every source URL's path on the "
        "new domain — recording status codes, redirect chains, and a final "
        "verdict (OK / Redirected / Missing / Error) per URL."
    ),
    when_to_use=(
        "When the user wants to verify MANY URLs or a whole URL set "
        "against a new domain — 'do all these old URLs exist on the new "
        "site', 'check the migration', 'test the discovered set against "
        "staging', 'verify these URLs resolve', 'run the comparison'. "
        "Either url_set_id (a discovered set — its included URLs are "
        "snapshotted) or source_urls (ad-hoc list) is required, plus "
        "new_domain."
    ),
    when_not_to_use=(
        "Do not use to check a single URL — use check_url. Do not use to "
        "find a site's URLs — use discover_urls first."
    ),
    edge_cases=[
        "Exactly one of url_set_id or source_urls must be given (conflicting_params otherwise).",
        "The job is asynchronous — returns job_id + total_urls immediately; poll get_job_status, then get_comparison_report.",
        "url_set_id mode snapshots the set's currently-included URLs — later toggles do not affect this job.",
        "Comparison checks the PATH of each source URL on the new domain (e.g. old.com/about → new.com/about).",
    ],
    error_behavior=(
        "conflicting_params for both/neither URL inputs, url_blocked for "
        "private addresses, no_included_urls for an empty set, not_found "
        "for an unknown url_set_id."
    ),
    parameters=[
        ParameterSpec(
            name="new_domain",
            type="string",
            description="Absolute http(s) URL of the new domain to check paths against, e.g. 'https://new-site.com'.",
            required=True,
            examples=["https://new-site.com", "https://staging.example.com"],
        ),
        ParameterSpec(
            name="url_set_id",
            type="string",
            description="URL set whose included URLs are compared (mutually exclusive with source_urls).",
            required=False,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="source_urls",
            type="array",
            description="Ad-hoc list of absolute source URLs (mutually exclusive with url_set_id).",
            required=False,
            examples=[["https://old-site.com/", "https://old-site.com/about"]],
        ),
        ParameterSpec(
            name="name",
            type="string",
            description="Optional human-readable label for the job.",
            required=False,
            examples=["prod cutover check"],
        ),
        ParameterSpec(
            name="follow_redirects",
            type="boolean",
            description="Follow redirect chains to the final URL. Default true.",
            required=False,
            default=True,
        ),
        ParameterSpec(
            name="max_concurrency",
            type="integer",
            description="Parallel checks (1-50). Default 10.",
            required=False,
            default=10,
            examples=[10, 20],
        ),
        ParameterSpec(
            name="retry_attempts",
            type="integer",
            description="Retries per failing URL (0-10). Default 3.",
            required=False,
            default=3,
            examples=[0, 3],
        ),
        ParameterSpec(
            name="timeout_seconds",
            type="integer",
            description="Per-request timeout (1-60s). Default 10.",
            required=False,
            default=10,
            examples=[10, 30],
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="job_id", type="string", description="Comparison job id for polling/report."),
        OutputFieldSpec(name="total_urls", type="integer", description="How many URLs will be checked."),
    ],
    trust_justification=(
        "network verification — checking hundreds of URLs against a live "
        "domain with redirect-following and retries requires HTTP access "
        "and durable job state the model does not have."
    ),
    example_phrasings=[
        "Compare URL set cm0abc123 against https://new-site.com",
        "Check if the urls in set cm0abc123 work on staging.example.com",
        "Compare https://old.com/a and https://old.com/b to https://new-site.com",
        "Run the migration check on set cm0abc123 against the new domain",
        "Start a comparison of these urls to https://new-site.com: https://a.com, https://a.com/x",
        "Verify the migration — test set cm0abc123 on the new domain",
    ],
    read_only_hint=False,
    destructive_hint=False,
    idempotent_hint=False,
    open_world_hint=True,
)


# ── Tool 5: get_job_status ───────────────────────────────────────────────────

get_job_status = ToolSpec(
    name="get_job_status",
    title="Get Job Status",
    purpose="Poll the progress of a discovery or comparison job — status, completion counts, and (for discoveries) the produced url_set_id.",
    when_to_use=(
        "When the user asks whether a job is finished, still running, or "
        "how far along it is — 'is the crawl done', 'check the job status', "
        "how many URLs have been checked so far. Poll after discover_urls "
        "or start_comparison returns a job_id."
    ),
    when_not_to_use=(
        "Do not use for the actual results or verdicts — "
        "get_comparison_report returns per-URL outcomes. Do not use to "
        "browse all jobs — list_jobs. Do not use to stop a job — "
        "cancel_job."
    ),
    edge_cases=[
        "kind defaults to auto-detect (tries comparison, then discovery) — pass it explicitly to disambiguate.",
        "status values: pending, running, completed, failed, cancelled.",
        "A completed discovery exposes url_set_id + url_count; a completed comparison exposes a result summary (ok/redirected/missing/error counts).",
    ],
    error_behavior="not_found when no job with that id exists (in either kind when auto-detecting).",
    parameters=[
        ParameterSpec(
            name="job_id",
            type="string",
            description="The job id returned by discover_urls or start_comparison.",
            required=True,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="kind",
            type="string",
            description="Job kind: 'comparison' or 'discovery'. Default auto-detect.",
            required=False,
            enum=["comparison", "discovery"],
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="status", type="string", description="pending | running | completed | failed | cancelled."),
        OutputFieldSpec(name="progress", type="object", description="{completed, total} for comparisons."),
        OutputFieldSpec(name="url_set_id", type="string", description="Produced URL set (discovery only)."),
        OutputFieldSpec(name="summary", type="object", description="Result counts {totalUrls, ok, redirected, missing, error} for comparisons."),
    ],
    trust_justification=(
        "state lookup — job progress lives in the app's database; the "
        "model cannot know whether a job finished without asking."
    ),
    example_phrasings=[
        "Is job cm0abc123 finished yet?",
        "What's the status of job cm0abc123?",
        "How far along is comparison job cm0abc123?",
        "Check if discovery job cm0abc123 is done",
        "Did the comparison cm0abc123 complete?",
    ],
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Tool 6: get_comparison_report ────────────────────────────────────────────

get_comparison_report = ToolSpec(
    name="get_comparison_report",
    title="Get Comparison Report",
    purpose="Return the full results of a comparison job — per-URL verdicts, status codes, redirect chains — plus the ok/redirected/missing/error summary.",
    when_to_use=(
        "When the user asks for the RESULTS of a comparison — 'show me the "
        "results', 'which URLs failed/are missing', 'the migration report', "
        "'how many 404s', 'list the redirects'. Returns per-URL verdicts "
        "plus the ok/redirected/missing/error summary counts."
    ),
    when_not_to_use=(
        "Do not use for job progress or whether it finished — "
        "get_job_status. Do not use for the URLs a DISCOVERY found — "
        "list_discovered_urls."
    ),
    edge_cases=[
        "Results are capped (default 500, max 5000) — page with offset; total_results gives the real count.",
        "Per-URL result values: 'OK' (2xx on new domain), 'Redirected' (ended elsewhere), 'Missing' (404/410), 'Error' (network/other failure).",
        "redirect_chain lists the hops followed; final_url is where the check landed.",
        "For a downloadable file (json/csv/html), the web UI's export endpoint is the better fit — this returns structured data.",
    ],
    error_behavior="not_found for an unknown job_id; job_not_completed if the job failed or was cancelled.",
    parameters=[
        ParameterSpec(
            name="job_id",
            type="string",
            description="The comparison job id.",
            required=True,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="limit",
            type="integer",
            description="Max result rows to return (1-5000). Default 500.",
            required=False,
            default=500,
        ),
        ParameterSpec(
            name="offset",
            type="integer",
            description="Skip this many rows for pagination. Default 0.",
            required=False,
            default=0,
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="summary", type="object", description="{totalUrls, ok, redirected, missing, error}."),
        OutputFieldSpec(name="results", type="array", description="Per-URL rows: {sourceUrl, newUrl, statusCode, result, finalUrl, redirectChain, error}."),
        OutputFieldSpec(name="total_results", type="integer", description="Total result rows in the job."),
        OutputFieldSpec(name="job", type="object", description="Job metadata: id, name, newDomain, status."),
    ],
    trust_justification=(
        "state lookup — per-URL verdicts are stored results the model "
        "cannot produce without reading them."
    ),
    example_phrasings=[
        "Show me the results of comparison job cm0abc123",
        "Which URLs are missing in job cm0abc123?",
        "Give me the migration report for job cm0abc123",
        "How many pages returned 404 in job cm0abc123?",
        "List all the redirected URLs from job cm0abc123",
        "Summarize the results of job cm0abc123 — what failed?",
    ],
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Tool 7: check_url ────────────────────────────────────────────────────────

check_url = ToolSpec(
    name="check_url",
    title="Check Single URL",
    purpose="Synchronously check one source URL's path on a new domain and return the verdict — status code, redirect chain, final URL, and OK/Redirected/Missing/Error result.",
    when_to_use=(
        "For one-off spot checks — 'does old-site.com/pricing exist on the "
        "new domain', 'verify this URL before the launch'. Returns "
        "immediately with the verdict; no job is created."
    ),
    when_not_to_use=(
        "Do not use when there is more than one URL or the user refers to "
        "a set/list/collection of URLs ('these URLs', 'the set', 'all the "
        "URLs') — that is start_comparison. Do not use to enumerate site "
        "URLs — discover_urls."
    ),
    edge_cases=[
        "The check is on the PATH: sourceUrl 'https://old.com/a/b?x=1' checks 'newDomain + /a/b?x=1'.",
        "result 'Redirected' means the new URL answered but redirected elsewhere; the hops are in redirect_chain.",
        "follow_redirects=false returns the first response's status code only.",
    ],
    error_behavior="url_blocked for private/non-http addresses; invalid_input for malformed URLs.",
    parameters=[
        ParameterSpec(
            name="source_url",
            type="string",
            description="Absolute http(s) URL whose path is checked on the new domain.",
            required=True,
            examples=["https://old-site.com/about/team"],
        ),
        ParameterSpec(
            name="new_domain",
            type="string",
            description="Absolute http(s) new domain, e.g. 'https://new-site.com'.",
            required=True,
            examples=["https://new-site.com"],
        ),
        ParameterSpec(
            name="follow_redirects",
            type="boolean",
            description="Follow redirect chains. Default true.",
            required=False,
            default=True,
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="result", type="string", description="OK | Redirected | Missing | Error."),
        OutputFieldSpec(name="status_code", type="integer", description="HTTP status of the first (or final) response."),
        OutputFieldSpec(name="new_url", type="string", description="The URL actually checked on the new domain."),
        OutputFieldSpec(name="final_url", type="string", description="Where the check ended after redirects."),
        OutputFieldSpec(name="redirect_chain", type="array", description="Ordered list of redirect hops."),
    ],
    trust_justification=(
        "network verification — a live HTTP check with redirect-following "
        "against a real domain is not something the model can simulate "
        "reliably."
    ),
    example_phrasings=[
        "Does https://old.com/pricing exist on the new site?",
        "Check this one URL against https://new-site.com",
        "Quick spot-check: does /about/team work on the new domain?",
        "Verify old-site.com/contact resolves on staging",
    ],
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=True,
)


# ── Tool 8: cancel_job ───────────────────────────────────────────────────────

cancel_job = ToolSpec(
    name="cancel_job",
    title="Cancel Job",
    purpose="Cancel a running or pending discovery/comparison job, stopping further work.",
    when_to_use=(
        "When the user wants to STOP or CANCEL a job — 'cancel the crawl', "
        "'stop the comparison', 'kill that job', 'abort the discovery'. "
        "Only affects pending/running jobs; completed/failed jobs are "
        "untouched."
    ),
    when_not_to_use=(
        "Do not use to delete job records — cancellation stops work but "
        "keeps the job's results. Do not use for finished jobs (no-op)."
    ),
    edge_cases=[
        "kind defaults to auto-detect; pass it when the job kind is known.",
        "Cancellation is asynchronous — the job status flips to 'cancelled' once the runner observes the abort signal.",
    ],
    error_behavior="not_found for an unknown job_id.",
    parameters=[
        ParameterSpec(
            name="job_id",
            type="string",
            description="The job to cancel.",
            required=True,
            examples=["cm0abc123def456"],
        ),
        ParameterSpec(
            name="kind",
            type="string",
            description="'comparison' or 'discovery'. Default auto-detect.",
            required=False,
            enum=["comparison", "discovery"],
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="status", type="string", description="'cancelled' on success."),
    ],
    trust_justification=(
        "state mutation — the abort signal must reach the app's in-process "
        "job runner; the model cannot stop it otherwise."
    ),
    example_phrasings=[
        "Cancel job cm0abc123",
        "Stop comparison job cm0abc123",
        "Kill job cm0abc123, it's taking too long",
        "Abort discovery job cm0abc123",
    ],
    read_only_hint=False,
    destructive_hint=True,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Tool 9: list_jobs ────────────────────────────────────────────────────────

list_jobs = ToolSpec(
    name="list_jobs",
    title="List Jobs",
    purpose="Browse the history of recent discovery and comparison jobs — their ids, names, statuses, and targets — when no specific job is known.",
    when_to_use=(
        "Only when the user asks 'what jobs have run', 'show recent "
        "activity', or needs to DISCOVER a job_id they don't already have. "
        "This is a browsing tool — it returns a list, not a specific job's "
        "details."
    ),
    when_not_to_use=(
        "Do not use when the user wants to: check a specific job's progress "
        "or whether it finished (get_job_status), see a comparison's "
        "results or which URLs failed (get_comparison_report), stop or "
        "cancel a job (cancel_job), see the URLs a discovery found "
        "(list_discovered_urls), or modify a URL set (update_url_set). "
        "Those tools take the job_id directly — never call list_jobs first "
        "when the id or intent is already known."
    ),
    edge_cases=[
        "Returns up to 100 most recent jobs, newest first, with kind tags.",
        "detail field gives a one-line progress hint (e.g. '12/40 checked', '213 urls found').",
    ],
    error_behavior="None beyond internal_error — never fails on valid input.",
    parameters=[
        ParameterSpec(
            name="kind",
            type="string",
            description="Filter by job kind: 'comparison' or 'discovery'. Default: both.",
            required=False,
            enum=["comparison", "discovery"],
        ),
    ],
    output_fields=[
        OutputFieldSpec(name="jobs", type="array", description="[{id, name, kind, status, target, createdAt, detail}]."),
    ],
    trust_justification=(
        "state lookup — the job list lives in the app's database."
    ),
    example_phrasings=[
        "What jobs have I run?",
        "List all comparisons",
        "Show recent discovery jobs",
        "Any jobs still running?",
        "Find the job id for my last crawl",
    ],
    read_only_hint=True,
    destructive_hint=False,
    idempotent_hint=True,
    open_world_hint=False,
)


# ── Resources ────────────────────────────────────────────────────────────────

urlsets_resource = ResourceSpec(
    name="url-sets",
    uri_template="urlcompare://urlsets",
    description=(
        "All URL sets — discovered via discover_urls or created in the web "
        "UI — with url counts and source domains. Read urlcompare://urlsets/{id} "
        "for a set's URLs, or pass its id to update_url_set / start_comparison."
    ),
)

urlset_resource = ResourceSpec(
    name="url-set",
    uri_template="urlcompare://urlsets/{url_set_id}",
    description=(
        "The URLs in one set — canonicalized, with per-URL sources "
        "(crawl/sitemap/gsc/manual) and included flags."
    ),
)

jobs_resource = ResourceSpec(
    name="jobs",
    uri_template="urlcompare://jobs",
    description=(
        "Recent discovery and comparison jobs with statuses — a read-only "
        "activity feed for finding job ids."
    ),
)


# ── Server spec ──────────────────────────────────────────────────────────────

urlcompare = ServerSpec(
    name="urlcompare",
    title="urlCompare — URL Migration Checker",
    version="1.0.0",
    description=(
        "URL migration QA server: discover a site's URLs (crawl, sitemap, "
        "Google Search Console), review the merged URL set, then compare "
        "every path against a new domain and inspect per-URL verdicts "
        "(OK / Redirected / Missing / Error), redirect chains, and "
        "summaries."
    ),
    instructions=(
        "Workflow: discover_urls → get_job_status (until completed → "
        "url_set_id) → optional list_discovered_urls / update_url_set → "
        "start_comparison(url_set_id or source_urls, new_domain) → "
        "get_job_status → get_comparison_report. check_url = single "
        "synchronous spot-check. Jobs are async — poll; never assume "
        "instant results. GSC needs a connected account "
        "(gsc_not_connected → web UI)."
    ),
    tools=[
        discover_urls,
        list_discovered_urls,
        update_url_set,
        start_comparison,
        get_job_status,
        get_comparison_report,
        check_url,
        cancel_job,
        list_jobs,
    ],
    resources=[urlsets_resource, urlset_resource, jobs_resource],
    error_contract=error_contract,
)

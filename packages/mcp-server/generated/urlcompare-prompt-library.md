# urlCompare — URL Migration Checker — Prompt Library

Curated natural-language phrasings that route correctly to this server's MCP tools. Use these as templates for testing, documentation, or eval sets.

## Discover URLs

- "Crawl https://old-site.com and list its pages"
- "What URLs does my blog have? Use the sitemap"
- "Discover all pages on https://example.org via sitemap and crawl"
- "Find the URLs on my site using Search Console"
- "Scan old-site.com but skip the /wp-admin/ paths"
- "Enumerate pages under https://docs.example.com, max depth 5"
- "Discover this site, strip query strings, ignore fragments"
- "Build me a URL list for example.com before the migration"

## List Discovered URLs

- "Show me the URLs in set cm0abc123def456"
- "What pages did the discovery job find? The set id is cm0abc123"
- "List the urls in URL set cm0abc123"
- "Which URLs in set cm0abc123 are included?"
- "Give me the first 100 urls of set cm0abc123"

## Update URL Set

- "Exclude url cm0x1 from set cm0abc123"
- "Add https://old-site.com/hidden-page to URL set cm0abc123"
- "Don't include the /feed/ urls — toggle them off in set cm0abc123"
- "Mark url cm0x1 as excluded"
- "Add these two pages to set cm0abc123 manually"

## Start Comparison

- "Compare URL set cm0abc123 against https://new-site.com"
- "Check if the urls in set cm0abc123 work on staging.example.com"
- "Compare https://old.com/a and https://old.com/b to https://new-site.com"
- "Run the migration check on set cm0abc123 against the new domain"
- "Start a comparison of these urls to https://new-site.com: https://a.com, https://a.com/x"
- "Verify the migration — test set cm0abc123 on the new domain"

## Get Job Status

- "Is job cm0abc123 finished yet?"
- "What's the status of job cm0abc123?"
- "How far along is comparison job cm0abc123?"
- "Check if discovery job cm0abc123 is done"
- "Did the comparison cm0abc123 complete?"

## Get Comparison Report

- "Show me the results of comparison job cm0abc123"
- "Which URLs are missing in job cm0abc123?"
- "Give me the migration report for job cm0abc123"
- "How many pages returned 404 in job cm0abc123?"
- "List all the redirected URLs from job cm0abc123"
- "Summarize the results of job cm0abc123 — what failed?"

## Check Single URL

- "Does https://old.com/pricing exist on the new site?"
- "Check this one URL against https://new-site.com"
- "Quick spot-check: does /about/team work on the new domain?"
- "Verify old-site.com/contact resolves on staging"

## Cancel Job

- "Cancel job cm0abc123"
- "Stop comparison job cm0abc123"
- "Kill job cm0abc123, it's taking too long"
- "Abort discovery job cm0abc123"

## List Jobs

- "What jobs have I run?"
- "List all comparisons"
- "Show recent discovery jobs"
- "Any jobs still running?"
- "Find the job id for my last crawl"

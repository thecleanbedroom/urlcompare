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

- "Show me the URLs the discovery job found"
- "What pages are in URL set cm0abc123?"
- "List the discovered urls for that set"
- "Which URLs will be included in the comparison?"
- "Give me the first 100 urls in the set"

## Update URL Set

- "Exclude the /feed/* urls from that set"
- "Add https://old-site.com/hidden-page to the URL set"
- "Don't include the admin pages in the comparison"
- "Mark that URL as excluded"
- "Add these two pages to the discovered set manually"

## Start Comparison

- "Check if all the discovered URLs work on https://new-site.com"
- "Start a comparison of that URL set against staging.example.com"
- "Do these old URLs resolve on the new domain?"
- "Run the migration check against https://new-site.com"
- "Compare these 5 URLs to the new site: ..."
- "Verify the migration — test the whole set on the new domain"

## Get Job Status

- "Is the crawl finished yet?"
- "What's the status of job cm0abc123?"
- "How far along is the comparison?"
- "Check if my discovery job is done"
- "Did the migration check complete?"

## Get Comparison Report

- "Show me the comparison results"
- "Which URLs are missing on the new domain?"
- "Give me the migration report for job cm0abc123"
- "How many pages returned 404 on the new site?"
- "List all the redirected URLs from that comparison"
- "Summarize the results — what failed?"

## Check Single URL

- "Does https://old.com/pricing exist on the new site?"
- "Check this one URL against https://new-site.com"
- "Quick spot-check: does /about/team work on the new domain?"
- "Verify old-site.com/contact resolves on staging"

## Cancel Job

- "Cancel the running crawl"
- "Stop that comparison job"
- "Kill job cm0abc123, it's taking too long"
- "Abort the discovery"

## List Jobs

- "What jobs have I run?"
- "List all comparisons"
- "Show recent discovery jobs"
- "Any jobs still running?"
- "Find the job id for my last crawl"

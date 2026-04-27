## Layout Changes
- 2 columns, Configuration on the left 1/3 and Summary and Results on right 2/3.  Results on the right scrolling viewport height
- Add a tab to Results with URLs that are found.  These should be part of the results
- App workflow is setup on the left, then after the scan it shows urls found on the right, then once you have urls, you can then compare to get results
- Create a graphic and instructions on the right side when results are not shown.
- Move "Export CSV" "Export JSON" to the results section

## Configuration Changes
- Change Manual URLs tab title to "Scan"
- Change Scan Domain tab titlte to "Advanced"
- Add Third tab with title "URLs"

### Scan Tab
- Make Job Name full width input box
- Add Current Domain input below job name
- Move New Domain input below Current Domain
- Add Sources section of Scan Tab

#### Sources Section
- Add checkbox for "Crawl" default to on
- Add checkbox for "Sitemap" default to on
- Add checkbox for ""Google Search Console" (GSC) that uses Google Search Console Performance Pages

### Advanced Tab
- Remove Show Hide of "Advanced Options" and show
- Default max pages to 10000, max depth to 1000
- Add Checkbox for "Ignore Anchors" default to on
- Add Radio for "Query String", with options ignore, allow, deny. default to ignore
- Add Text areas for Query string keys to use for allow and deny
- Add checkbox for "Normalize Query String". default to on
- Add input for Google API key information "Google Search Console"

---

Clarifying Questions
Layout Changes
Two-column layout: The draft mentions Configuration on the left (1/3) and Summary/Results on the right (2/3). Should this be responsive (i.e., stack vertically on mobile), or is this a desktop-only application?
Answer: Desktop-only.
---
"Add a tab to Results with URLs that are found": I'm not entirely clear on this. Do you mean:
* A separate tab in the Results section showing all discovered/crawled URLs before comparison?
* Or a tab that filters results to show only URLs that were successfully found (status OK)?
Answer: skip/ignore that feature requenpst.
---
"Create a graphic and instructions on the right side when results are not shown": Should I generate an illustration/graphic, or use an icon-based placeholder? Any specific guidance on what the instructions should say?
Answer: skip/ignore that feature request.
---
Configuration Tab Restructuring
The new "URLs" tab (third tab): What specifically should be in this tab? Is this where the list of discovered/entered URLs would be displayed and edited before running the comparison?

---
Sources Section (Scan Tab)
Google Search Console integration: This is a significant feature requiring OAuth authentication. Do you have:
A Google Cloud project set up with Search Console API enabled?
Preference for OAuth flow (popup, redirect, service account)?
Sitemap scanning: Should this use robots.txt to discover sitemap URLs, or require the user to enter a sitemap URL directly? (look for robots.txt first, if not found, then look for sitemap.

Advanced Tab
Query String handling:
"Allow" means only include URLs with these query param keys?
"Deny" means exclude URLs with these query param keys?
"Ignore" means strip all query strings from URLs?
"Normalize Query String": What normalization is expected? Alphabetizing keys? Removing duplicated keys? Removing empty values?

Google API key input: Is this for the Search Console feature mentioned in the Scan tab? Should this be a separate settings/config page, or inline in Advanced?
Inline in Advanced Tab

Workflow Clarification
The draft mentions: "App workflow is setup on the left, then after the scan it shows urls found on the right, then once you have urls, you can then compare to get results." Should the workflow be:
Configure domain(s) and sources → Scan → View discovered URLs (editable?) → Compare → View results? (yes)
This is a change from the current flow where scanning and comparing are more tightly coupled.
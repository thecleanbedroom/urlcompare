/**
 * Result summary generation — counts by result status.
 */

import type { JobSummary } from 'shared-types'

export function generateSummary(results: { result: string }[]): JobSummary {
    return {
        totalUrls: results.length,
        ok: results.filter(r => r.result === 'OK').length,
        redirected: results.filter(r => r.result === 'Redirected').length,
        missing: results.filter(r => r.result === 'Missing').length,
        error: results.filter(r => r.result === 'Error').length
    }
}

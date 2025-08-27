import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const format = searchParams.get('format') || 'json'

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    // Get job with results
    const job = await db.comparisonJob.findUnique({
      where: { id: jobId },
      include: {
        urlResults: {
          orderBy: { checkedAt: 'asc' }
        }
      }
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    const results = job.urlResults.map(result => ({
      sourceUrl: result.sourceUrl,
      newUrl: result.newUrl,
      statusCode: result.statusCode,
      redirectChain: JSON.parse(result.redirectChain || '[]'),
      finalUrl: result.finalUrl,
      result: result.result,
      error: result.error,
      retryCount: result.retryCount,
      checkedAt: result.checkedAt
    }))

    const summary = {
      totalUrls: results.length,
      ok: results.filter(r => r.result === 'OK').length,
      redirected: results.filter(r => r.result === 'Redirected').length,
      missing: results.filter(r => r.result === 'Missing').length,
      error: results.filter(r => r.result === 'Error').length
    }

    if (format === 'json') {
      const exportData = {
        job: {
          id: job.id,
          name: job.name,
          newDomain: job.newDomain,
          createdAt: job.createdAt,
          status: job.status
        },
        summary,
        results,
        exportedAt: new Date().toISOString()
      }

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.json"`
        }
      })
    } else if (format === 'csv') {
      const headers = [
        'Source URL',
        'New URL', 
        'Status Code',
        'Result',
        'Final URL',
        'Redirect Chain',
        'Error',
        'Retry Count',
        'Checked At'
      ]

      const csvContent = [
        headers.join(','),
        ...results.map(r => [
          `"${r.sourceUrl}"`,
          `"${r.newUrl}"`,
          r.statusCode || '',
          r.result,
          `"${r.finalUrl || ''}"`,
          `"${r.redirectChain.join(' → ')}"`,
          `"${r.error || ''}"`,
          r.retryCount,
          `"${r.checkedAt}"`
        ].join(','))
      ].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.csv"`
        }
      })
    } else if (format === 'html') {
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>URL Comparison Report - ${job.name || 'Untitled'}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .summary-card { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 6px; text-align: center; }
        .summary-number { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
        .summary-label { font-size: 14px; color: #666; }
        .results-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .results-table th, .results-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .results-table th { background: #f5f5f5; font-weight: bold; }
        .results-table tr:nth-child(even) { background: #f9f9f9; }
        .status-ok { color: #22c55e; font-weight: bold; }
        .status-missing { color: #ef4444; font-weight: bold; }
        .status-error { color: #ef4444; font-weight: bold; }
        .status-redirected { color: #3b82f6; font-weight: bold; }
        .error { color: #ef4444; font-size: 12px; }
        .redirect-chain { font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>URL Comparison Report</h1>
        <h2>${job.name || 'Untitled'}</h2>
        <p>Job ID: ${job.id}</p>
        <p>Created: ${new Date(job.createdAt).toLocaleString()}</p>
        <p>New Domain: ${job.newDomain}</p>
    </div>

    <div class="summary">
        <div class="summary-card">
            <div class="summary-number">${summary.totalUrls}</div>
            <div class="summary-label">Total URLs</div>
        </div>
        <div class="summary-card">
            <div class="summary-number status-ok">${summary.ok}</div>
            <div class="summary-label">OK</div>
        </div>
        <div class="summary-card">
            <div class="summary-number status-redirected">${summary.redirected}</div>
            <div class="summary-label">Redirected</div>
        </div>
        <div class="summary-card">
            <div class="summary-number status-missing">${summary.missing}</div>
            <div class="summary-label">Missing</div>
        </div>
        <div class="summary-card">
            <div class="summary-number status-error">${summary.error}</div>
            <div class="summary-label">Errors</div>
        </div>
    </div>

    <h3>Detailed Results</h3>
    <table class="results-table">
        <thead>
            <tr>
                <th>Source URL</th>
                <th>New URL</th>
                <th>Status Code</th>
                <th>Result</th>
                <th>Final URL</th>
                <th>Redirect Chain</th>
                <th>Error</th>
                <th>Retry Count</th>
                <th>Checked At</th>
            </tr>
        </thead>
        <tbody>
            ${results.map(r => `
                <tr>
                    <td>${r.sourceUrl}</td>
                    <td>${r.newUrl}</td>
                    <td>${r.statusCode || '-'}</td>
                    <td class="status-${r.result.toLowerCase()}">${r.result}</td>
                    <td>${r.finalUrl || '-'}</td>
                    <td class="redirect-chain">${r.redirectChain.length > 0 ? r.redirectChain.join(' → ') : '-'}</td>
                    <td class="error">${r.error || '-'}</td>
                    <td>${r.retryCount}</td>
                    <td>${new Date(r.checkedAt).toLocaleString()}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div style="margin-top: 30px; font-size: 12px; color: #666; text-align: center;">
        Report generated on ${new Date().toLocaleString()}
    </div>
</body>
</html>`

      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="url-comparison-${job.id}.html"`
        }
      })
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use json, csv, or html' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('Error exporting results:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
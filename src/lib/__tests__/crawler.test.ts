import { describe, it, expect } from 'vitest'

/**
 * Tests for crawler utility logic.
 * Since normalizeUrl, matchGlob, and extractLinks are private methods,
 * we test the glob pattern matching and URL normalization logic directly.
 */

// Re-implement the private methods as standalone functions for testing
// (These mirror the exact logic in DomainCrawler)

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1)
    }
    if ((parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = ''
    }
    parsed.hash = ''
    parsed.searchParams.sort()
    return parsed.href
  } catch {
    return url
  }
}

function matchGlob(url: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  const regex = new RegExp(regexPattern, 'i')
  return regex.test(url)
}

function matchesPatterns(
  url: string,
  includePatterns?: string[],
  excludePatterns?: string[]
): boolean {
  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchGlob(url, pattern)) return false
    }
  }
  if (includePatterns && includePatterns.length > 0) {
    for (const pattern of includePatterns) {
      if (matchGlob(url, pattern)) return true
    }
    return false
  }
  return true
}

function extractLinks(html: string, baseUrl: string, baseDomain: string): string[] {
  const links: string[] = []
  const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi
  let match

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1]
      if (href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#') ||
        href.startsWith('data:')) {
        continue
      }
      const absoluteUrl = new URL(href, baseUrl)
      if (absoluteUrl.hostname !== baseDomain) continue
      links.push(normalizeUrl(absoluteUrl.href))
    } catch {
      // skip
    }
  }
  return links
}

describe('URL normalization', () => {
  it('removes trailing slash from non-root paths', () => {
    expect(normalizeUrl('https://example.com/about/')).toBe('https://example.com/about')
  })

  it('keeps root path slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('removes default HTTPS port 443', () => {
    expect(normalizeUrl('https://example.com:443/path')).toBe('https://example.com/path')
  })

  it('removes default HTTP port 80', () => {
    expect(normalizeUrl('http://example.com:80/path')).toBe('http://example.com/path')
  })

  it('removes hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('https://example.com/page')
  })

  it('sorts query parameters', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1')).toBe('https://example.com/?a=1&b=2')
  })

  it('preserves non-default ports', () => {
    expect(normalizeUrl('https://example.com:8443/path')).toBe('https://example.com:8443/path')
  })

  it('returns invalid URL as-is', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url')
  })
})

describe('glob pattern matching', () => {
  it('matches exact string', () => {
    expect(matchGlob('https://example.com/about', 'https://example.com/about')).toBe(true)
  })

  it('matches with wildcard *', () => {
    expect(matchGlob('https://example.com/about', '*example*')).toBe(true)
  })

  it('matches with single char ?', () => {
    expect(matchGlob('https://example.com/a', 'https://example.com/?')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchGlob('HTTPS://EXAMPLE.COM', 'https://example.com')).toBe(true)
  })

  it('does not match non-matching pattern', () => {
    expect(matchGlob('https://example.com/about', '*/contact')).toBe(false)
  })
})

describe('include/exclude pattern filtering', () => {
  it('allows URL with no patterns', () => {
    expect(matchesPatterns('https://example.com/about')).toBe(true)
  })

  it('blocks URL matching exclude pattern', () => {
    expect(matchesPatterns('https://example.com/admin', undefined, ['*/admin*'])).toBe(false)
  })

  it('allows URL not matching exclude pattern', () => {
    expect(matchesPatterns('https://example.com/about', undefined, ['*/admin*'])).toBe(true)
  })

  it('requires URL to match include pattern when specified', () => {
    expect(matchesPatterns('https://example.com/products/item', ['*/products*'])).toBe(true)
    expect(matchesPatterns('https://example.com/about', ['*/products*'])).toBe(false)
  })

  it('exclude takes precedence over include', () => {
    expect(matchesPatterns('https://example.com/products/secret', ['*/products*'], ['*/secret*'])).toBe(false)
  })
})

describe('link extraction from HTML', () => {
  const baseUrl = 'https://example.com/page'
  const baseDomain = 'example.com'

  it('extracts anchor links', () => {
    const html = '<a href="/about">About</a><a href="/contact">Contact</a>'
    const links = extractLinks(html, baseUrl, baseDomain)
    expect(links).toContain('https://example.com/about')
    expect(links).toContain('https://example.com/contact')
  })

  it('skips javascript: links', () => {
    const html = '<a href="javascript:void(0)">Click</a><a href="/real">Real</a>'
    const links = extractLinks(html, baseUrl, baseDomain)
    expect(links).toEqual(['https://example.com/real'])
  })

  it('skips mailto: links', () => {
    const html = '<a href="mailto:test@example.com">Email</a><a href="/page2">Page</a>'
    const links = extractLinks(html, baseUrl, baseDomain)
    expect(links).toEqual(['https://example.com/page2'])
  })

  it('skips external domain links', () => {
    const html = '<a href="https://other.com/page">External</a><a href="/internal">Internal</a>'
    const links = extractLinks(html, baseUrl, baseDomain)
    expect(links).toEqual(['https://example.com/internal'])
  })

  it('resolves relative URLs', () => {
    const html = '<a href="subpage">Sub</a>'
    const links = extractLinks(html, 'https://example.com/parent/', baseDomain)
    expect(links).toEqual(['https://example.com/parent/subpage'])
  })

  it('handles empty HTML', () => {
    const links = extractLinks('', baseUrl, baseDomain)
    expect(links).toEqual([])
  })
})

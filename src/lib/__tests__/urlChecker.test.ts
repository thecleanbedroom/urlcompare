import { describe, it, expect } from 'vitest'
import { extractPath, constructNewUrl, isUrlSafe, isPrivateIPv4 } from '../urlChecker'

describe('extractPath', () => {
  it('extracts pathname from a URL', () => {
    expect(extractPath('https://example.com/about')).toBe('/about')
  })

  it('extracts pathname + query params', () => {
    expect(extractPath('https://example.com/search?q=hello')).toBe('/search?q=hello')
  })

  it('extracts pathname + query + hash', () => {
    expect(extractPath('https://example.com/page?q=1#section')).toBe('/page?q=1#section')
  })

  it('returns / for root URL', () => {
    expect(extractPath('https://example.com/')).toBe('/')
  })

  it('returns / for invalid URL', () => {
    expect(extractPath('not-a-url')).toBe('/')
  })
})

describe('constructNewUrl', () => {
  it('combines path with domain', () => {
    expect(constructNewUrl('/about', 'https://new.example.com')).toBe('https://new.example.com/about')
  })

  it('strips trailing slash from domain', () => {
    expect(constructNewUrl('/about', 'https://new.example.com/')).toBe('https://new.example.com/about')
  })

  it('handles path with query params', () => {
    expect(constructNewUrl('/search?q=1', 'https://new.example.com')).toBe('https://new.example.com/search?q=1')
  })

  it('handles root path', () => {
    expect(constructNewUrl('/', 'https://new.example.com')).toBe('https://new.example.com/')
  })
})

describe('isPrivateIPv4', () => {
  it('blocks localhost', () => {
    expect(isPrivateIPv4('localhost')).toBe(true)
  })

  it('blocks IPv6 loopback [::1]', () => {
    expect(isPrivateIPv4('[::1]')).toBe(true)
  })

  it('blocks IPv6 loopback ::1', () => {
    expect(isPrivateIPv4('::1')).toBe(true)
  })

  it('blocks 127.x.x.x (loopback)', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true)
    expect(isPrivateIPv4('127.1.2.3')).toBe(true)
  })

  it('blocks 10.x.x.x (RFC 1918)', () => {
    expect(isPrivateIPv4('10.0.0.1')).toBe(true)
    expect(isPrivateIPv4('10.255.255.255')).toBe(true)
  })

  it('blocks 192.168.x.x (RFC 1918)', () => {
    expect(isPrivateIPv4('192.168.0.1')).toBe(true)
    expect(isPrivateIPv4('192.168.1.100')).toBe(true)
  })

  it('blocks 172.16-31.x.x (RFC 1918)', () => {
    expect(isPrivateIPv4('172.16.0.1')).toBe(true)
    expect(isPrivateIPv4('172.31.255.255')).toBe(true)
    expect(isPrivateIPv4('172.20.5.5')).toBe(true)
  })

  it('allows public 172.x IPs outside 16-31 range', () => {
    expect(isPrivateIPv4('172.217.0.1')).toBe(false)  // Google DNS
    expect(isPrivateIPv4('172.15.0.1')).toBe(false)
    expect(isPrivateIPv4('172.32.0.1')).toBe(false)
  })

  it('blocks 169.254.x.x (link-local / AWS metadata)', () => {
    expect(isPrivateIPv4('169.254.169.254')).toBe(true)
    expect(isPrivateIPv4('169.254.0.1')).toBe(true)
  })

  it('allows public IPs', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4('1.1.1.1')).toBe(false)
    expect(isPrivateIPv4('203.0.113.1')).toBe(false)
  })
})

describe('isUrlSafe', () => {
  it('allows HTTPS URLs', () => {
    const result = isUrlSafe('https://example.com/page')
    expect(result.safe).toBe(true)
  })

  it('allows HTTP URLs', () => {
    const result = isUrlSafe('http://example.com/page')
    expect(result.safe).toBe(true)
  })

  it('blocks file:// URLs', () => {
    const result = isUrlSafe('file:///etc/passwd')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('Unsupported protocol')
  })

  it('blocks ftp:// URLs', () => {
    const result = isUrlSafe('ftp://example.com/file')
    expect(result.safe).toBe(false)
  })

  it('blocks AWS metadata IP', () => {
    const result = isUrlSafe('http://169.254.169.254/latest/meta-data/')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('Private/internal')
  })

  it('blocks localhost', () => {
    const result = isUrlSafe('http://localhost:3000/api/admin')
    expect(result.safe).toBe(false)
  })

  it('blocks 10.x.x.x', () => {
    const result = isUrlSafe('http://10.0.0.1/internal')
    expect(result.safe).toBe(false)
  })

  it('blocks 192.168.x.x', () => {
    const result = isUrlSafe('http://192.168.1.1/router')
    expect(result.safe).toBe(false)
  })

  it('allows public 172.217.x.x (Google)', () => {
    const result = isUrlSafe('https://172.217.0.1/')
    expect(result.safe).toBe(true)
  })

  it('blocks invalid URLs', () => {
    const result = isUrlSafe('not-a-url')
    expect(result.safe).toBe(false)
    expect(result.reason).toContain('Invalid URL')
  })
})

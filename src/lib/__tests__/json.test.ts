import { describe, it, expect } from 'vitest'
import { safeParseJson, toJsonString } from '../json'

describe('safeParseJson', () => {
  it('parses valid JSON array', () => {
    const result = safeParseJson<string[]>('["a","b","c"]', [])
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('parses valid JSON object', () => {
    const result = safeParseJson<{ key: string }>('{"key":"value"}', { key: '' })
    expect(result).toEqual({ key: 'value' })
  })

  it('returns fallback for invalid JSON', () => {
    const result = safeParseJson<string[]>('{not valid json}', [])
    expect(result).toEqual([])
  })

  it('returns fallback for null input', () => {
    const result = safeParseJson<string[]>(null, [])
    expect(result).toEqual([])
  })

  it('returns fallback for undefined input', () => {
    const result = safeParseJson<string[]>(undefined, [])
    expect(result).toEqual([])
  })

  it('preserves complex nested objects', () => {
    const input = JSON.stringify({ a: [1, 2], b: { c: true } })
    const result = safeParseJson(input, {})
    expect(result).toEqual({ a: [1, 2], b: { c: true } })
  })
})

describe('toJsonString', () => {
  it('serializes arrays', () => {
    expect(toJsonString(['a', 'b'])).toBe('["a","b"]')
  })

  it('serializes objects', () => {
    expect(toJsonString({ key: 'value' })).toBe('{"key":"value"}')
  })

  it('serializes null to "null"', () => {
    expect(toJsonString(null)).toBe('null')
  })

  it('serializes strings with JSON quoting', () => {
    expect(toJsonString('hello')).toBe('"hello"')
  })

  it('returns "[]" fallback for array on serialization error', () => {
    // Circular reference causes stringify to throw
    const circular: unknown[] = []
    circular.push(circular)
    expect(toJsonString(circular)).toBe('[]')
  })

  it('returns "{}" fallback for object on serialization error', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    expect(toJsonString(obj)).toBe('{}')
  })
})

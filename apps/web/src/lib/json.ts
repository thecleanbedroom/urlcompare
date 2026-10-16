/**
 * Safe JSON parsing and serialization utilities.
 * Prevents crashes from malformed JSON in the database.
 */

/**
 * Safely parse a JSON string, returning a fallback value on failure.
 */
export function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Safely serialize a value to a JSON string.
 * Returns '[]' for arrays and '{}' for objects if serialization fails.
 */
export function toJsonString(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return Array.isArray(value) ? '[]' : '{}'
  }
}

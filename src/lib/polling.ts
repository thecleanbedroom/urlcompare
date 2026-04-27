/**
 * Calculate exponential backoff delay for polling.
 * Starts at `baseMs`, multiplies by `factor` each poll, capped at `maxMs`.
 *
 * @param pollCount - Number of polls completed (0-based)
 * @param baseMs - Initial delay in ms (default 2000)
 * @param factor - Multiplication factor (default 1.5)
 * @param maxMs - Maximum delay cap in ms (default 15000)
 * @returns Delay in milliseconds
 */
export function getBackoffDelay(
  pollCount: number,
  baseMs = 2000,
  factor = 1.5,
  maxMs = 15000
): number {
  const delay = baseMs * Math.pow(factor, pollCount)
  return Math.min(delay, maxMs)
}

/**
 * Shared status utilities for displaying URL check results.
 * Used by page.tsx and ResultCard.tsx.
 */
'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

/**
 * Get the appropriate status icon based on result
 */
export function getStatusIcon(result: string) {
  switch (result) {
    case 'OK':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'Missing':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'Error':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    case 'Redirected':
      return <AlertCircle className="h-4 w-4 text-blue-500" />
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500" />
  }
}

/**
 * Get status badge with proper variant and label
 */
export function getStatusBadge(result: string) {
  const variants: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    OK: 'success',
    Missing: 'destructive',
    Error: 'destructive',
    Redirected: 'warning'
  }

  const labels: Record<string, string> = {
    OK: 'OK',
    Redirected: 'Redirected',
    Missing: 'Not Found',
    Error: 'Not Found'
  }

  return (
    <Badge variant={variants[result] || 'secondary'} className="flex items-center gap-1">
      {getStatusIcon(result)}
      {labels[result] || result}
    </Badge>
  )
}

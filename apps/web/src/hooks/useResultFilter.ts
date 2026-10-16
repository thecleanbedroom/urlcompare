'use client'

import { useState } from 'react'
import type { UrlResult, StatusFilter } from '@/types'

interface UseResultFilterReturn {
  statusFilter: StatusFilter
  setStatusFilter: (v: StatusFilter) => void
  pathFilter: string
  setPathFilter: (v: string) => void
  filterResults: (results: UrlResult[]) => UrlResult[]
}

export function useResultFilter(): UseResultFilterReturn {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [pathFilter, setPathFilter] = useState('')

  const filterResults = (results: UrlResult[]): UrlResult[] => {
    return results.filter(result => {
      let statusMatch = true
      if (statusFilter === 'ok') statusMatch = result.result === 'OK'
      else if (statusFilter === 'redirected') statusMatch = result.result === 'Redirected'
      else if (statusFilter === 'not-found') statusMatch = result.result === 'Missing' || result.result === 'Error'

      const pathMatch = pathFilter === '' ||
        result.sourceUrl.toLowerCase().includes(pathFilter.toLowerCase()) ||
        result.newUrl.toLowerCase().includes(pathFilter.toLowerCase())

      return statusMatch && pathMatch
    })
  }

  return {
    statusFilter,
    setStatusFilter,
    pathFilter,
    setPathFilter,
    filterResults,
  }
}

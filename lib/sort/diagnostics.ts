import type { SortDecision } from './types'

export type SortDiagnosticSummary = {
  gpsDateCount: number
  exifDateOnlyCount: number
  mtimeFallbackCount: number
  unknownCount: number
}

export function summarizeSortDecisions(decisions: SortDecision[]): SortDiagnosticSummary {
  let gpsDateCount = 0
  let exifDateOnlyCount = 0
  let mtimeFallbackCount = 0
  let unknownCount = 0

  for (const decision of decisions) {
    if (decision.strategy === 'gps_date') {
      gpsDateCount += 1
      continue
    }

    if (decision.strategy === 'date_only') {
      if (decision.reason.includes('using_file_mtime')) {
        mtimeFallbackCount += 1
      } else {
        exifDateOnlyCount += 1
      }
      continue
    }

    if (decision.strategy === 'unknown') {
      unknownCount += 1
    }
  }

  return {
    gpsDateCount,
    exifDateOnlyCount,
    mtimeFallbackCount,
    unknownCount,
  }
}

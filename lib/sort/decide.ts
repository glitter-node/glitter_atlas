import { statSync } from 'node:fs'
import type { PhotoMeta } from '../exif/types'
import type { GeoInfo } from '../geo/types'
import { normalizePathSegment } from './normalize'
import type { SortDecision } from './types'

export function decidePhotoTarget(meta: PhotoMeta, geo: GeoInfo | null): SortDecision {
  try {
    if (meta.year && meta.month && geo && geo.country && geo.locality) {
      return {
        strategy: 'gps_date',
        targetDir: buildPath([
          meta.year,
          meta.month,
          geo.country,
          geo.locality,
        ]),
        confidence: 0.95,
        reason: [
          'has_capture_date',
          'has_gps_location',
          'resolved_country',
          'resolved_locality',
        ],
      }
    }

    if (meta.year && meta.month && meta.day) {
      return {
        strategy: 'date_only',
        targetDir: buildPath([meta.year, meta.month, meta.day]),
        confidence: 0.75,
        reason: [
          'has_capture_date',
          'missing_usable_location',
        ],
      }
    }

    if (meta.cameraModel) {
      return {
        strategy: 'device_only',
        targetDir: buildPath(['device', meta.cameraModel]),
        confidence: 0.45,
        reason: [
          'missing_capture_date',
          'using_camera_model',
        ],
      }
    }

    const fallbackDateParts = getDatePartsFromMtime(meta.filePath)

    if (fallbackDateParts) {
      return {
        strategy: 'date_only',
        targetDir: buildPath([
          fallbackDateParts.year,
          fallbackDateParts.month,
          fallbackDateParts.day,
        ]),
        confidence: 0.35,
        reason: [
          'missing_capture_date',
          'using_file_mtime',
        ],
      }
    }

    return {
      strategy: 'unknown',
      targetDir: '/unknown',
      confidence: 0.1,
      reason: ['insufficient_metadata'],
    }
  } catch {
    return {
      strategy: 'unknown',
      targetDir: '/unknown',
      confidence: 0.1,
      reason: ['insufficient_metadata'],
    }
  }
}

function buildPath(segments: Array<string | null | undefined>) {
  return `/${segments.map((segment) => normalizePathSegment(segment)).join('/')}`
}

function getDatePartsFromMtime(filePath: string | null | undefined) {
  if (!filePath) {
    return null
  }

  try {
    const stats = statSync(filePath)
    const date = new Date(stats.mtimeMs)

    if (Number.isNaN(date.getTime())) {
      return null
    }

    return {
      year: String(date.getUTCFullYear()).padStart(4, '0'),
      month: String(date.getUTCMonth() + 1).padStart(2, '0'),
      day: String(date.getUTCDate()).padStart(2, '0'),
    }
  } catch {
    return null
  }
}

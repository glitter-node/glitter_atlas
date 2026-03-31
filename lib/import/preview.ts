import { extractPhotoMeta } from '../exif/extract'
import { reverseGeocode } from '../geo/reverse_geocode'
import { collectImageFiles } from './files'
import type { PreviewItem } from './types'
import { decidePhotoTarget } from '../sort/decide'

export async function buildPreviewItems(inputDir: string): Promise<PreviewItem[]> {
  const filePaths = await collectImageFiles(inputDir)
  const items: PreviewItem[] = []

  for (const filePath of filePaths) {
    try {
      const meta = await extractPhotoMeta(filePath)
      const geo =
        typeof meta.gpsLat === 'number' && typeof meta.gpsLng === 'number'
          ? await reverseGeocode(meta.gpsLat, meta.gpsLng)
          : null
      const decision = decidePhotoTarget(meta, geo)

      items.push({
        filePath,
        meta,
        geo,
        decision,
      })
    } catch {
      continue
    }
  }

  return items
}

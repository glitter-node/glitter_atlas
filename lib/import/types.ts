import type { PhotoMeta } from '../exif/types'
import type { GeoInfo } from '../geo/types'
import type { SortDecision } from '../sort/types'

export type PreviewItem = {
  filePath: string
  meta: PhotoMeta
  geo: GeoInfo | null
  decision: SortDecision
}

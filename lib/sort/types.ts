export type SortStrategy = 'gps_date' | 'date_only' | 'device_only' | 'unknown'

export type SortDecision = {
  strategy: SortStrategy
  targetDir: string
  confidence: number
  reason: string[]
}

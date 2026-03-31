export type ApplyMode = 'copy' | 'move'

export type ApplyItemResult = {
  sourcePath: string
  destinationPath: string | null
  mode: ApplyMode
  status: 'success' | 'failed' | 'skipped'
  error: string | null
}

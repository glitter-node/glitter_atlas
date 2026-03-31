export function normalizePathSegment(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return 'unknown'
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')

  return normalized ? normalized : 'unknown'
}

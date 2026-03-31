const allowedPathPrefixes = ['/volume/', '/volume1/', '/data/', '/mnt/']

export function getConfiguredPath(name: 'IMG_EXPORT_DATA' | 'IMG_EXPORT_TARGET') {
  const value = process.env[name]?.trim()

  if (!value) {
    return {
      ok: false as const,
      error: `${name} is not configured`,
    }
  }

  if (!allowedPathPrefixes.some((prefix) => value.startsWith(prefix))) {
    return {
      ok: false as const,
      error: `${name} has an invalid path prefix`,
    }
  }

  return {
    ok: true as const,
    value,
  }
}

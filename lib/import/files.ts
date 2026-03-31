import { readdir } from 'fs/promises'
import { resolve } from 'path'

const allowedExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
])

export async function collectImageFiles(inputDir: string): Promise<string[]> {
  try {
    return await walk(resolve(inputDir))
  } catch {
    return []
  }
}

async function walk(currentDir: string): Promise<string[]> {
  try {
    const entries = await readdir(currentDir, { withFileTypes: true })
    const results: string[] = []

    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name)

      if (entry.isDirectory()) {
        results.push(...(await walk(fullPath)))
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = getExtension(entry.name)

      if (allowedExtensions.has(extension)) {
        results.push(fullPath)
      }
    }

    return results
  } catch {
    return []
  }
}

function getExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

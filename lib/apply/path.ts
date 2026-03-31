import { access, mkdir } from 'fs/promises'
import { basename, extname, join, parse, resolve } from 'path'

export async function ensureTargetDir(targetRoot: string, decisionTargetDir: string): Promise<string> {
  const safeRelative = decisionTargetDir.replace(/^\/+/, '')
  const targetDir = resolve(targetRoot, safeRelative)
  await mkdir(targetDir, { recursive: true })
  return targetDir
}

export async function resolveAvailableDestinationPath(
  sourcePath: string,
  targetDir: string,
  sha256: string,
): Promise<string> {
  const originalName = basename(sourcePath)
  const originalPath = join(targetDir, originalName)

  if (!(await pathExists(originalPath))) {
    return originalPath
  }

  const { name, ext } = parse(originalName)
  const timestamp = buildTimestamp()
  const timestampPath = join(targetDir, `${name}__${timestamp}${ext}`)

  if (!(await pathExists(timestampPath))) {
    return timestampPath
  }

  const sha8 = sha256.slice(0, 8)
  return join(targetDir, `${name}__${timestamp}__${sha8}${extname(originalName)}`)
}

async function pathExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function buildTimestamp() {
  const now = new Date()
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

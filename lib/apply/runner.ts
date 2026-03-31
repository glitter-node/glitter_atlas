import fs from 'node:fs'
import path from 'node:path'
import { copyFile, mkdir, rename, unlink } from 'fs/promises'
import type { PreviewItem } from '../import/types'
import { resolveAvailableDestinationPath } from './path'
import type { ApplyItemResult, ApplyMode } from './types'

export async function applyPreviewItems(
  items: PreviewItem[],
  targetRoot: string,
  mode: ApplyMode,
): Promise<ApplyItemResult[]> {
  const results: ApplyItemResult[] = []
  const sourceRoot = process.env.IMG_EXPORT_DATA

  for (const item of items) {
    try {
      if (!sourceRoot) {
        throw new Error('IMG_EXPORT_DATA is not configured')
      }

      const sourcePath = resolveSafeSourcePath(sourceRoot, item.sourcePath)
      const safeDestinationPath = resolveSafeDestination(
        targetRoot,
        item.decision.targetDir,
        path.basename(item.sourcePath),
      )
      const targetDir = path.dirname(safeDestinationPath)
      await mkdir(targetDir, { recursive: true })
      const destinationPath = await resolveAvailableDestinationPath(
        sourcePath,
        targetDir,
        item.meta.sha256,
      )

      if (sourcePath === path.resolve(destinationPath)) {
        results.push({
          sourcePath,
          destinationPath,
          mode,
          status: 'skipped',
          error: null,
        })
        continue
      }

      if (mode === 'copy') {
        await copyFile(sourcePath, destinationPath)
      } else {
        await moveFile(sourcePath, destinationPath)
      }

      results.push({
        sourcePath,
        destinationPath,
        mode,
        status: 'success',
        error: null,
      })
    } catch (error) {
      results.push({
        sourcePath: item.filePath,
        destinationPath: null,
        mode,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown error',
      })
    }
  }

  return results
}

function resolveSafeDestination(root: string, targetDir: string, fileName: string) {
  const safeRoot = path.resolve(root)
  const rawTargetDir = String(targetDir || '')

  if (
    rawTargetDir.startsWith('/') ||
    rawTargetDir.startsWith('\\') ||
    path.isAbsolute(rawTargetDir)
  ) {
    throw new Error('Invalid destination path')
  }

  const normalizedDir = rawTargetDir.replace(/^([/\\])+/, '')
  const destinationPath = path.resolve(safeRoot, normalizedDir, fileName)
  const relative = path.relative(safeRoot, destinationPath)

  if (!relative || relative === '.' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid destination path')
  }

  return destinationPath
}

function resolveSafeSourcePath(root: string, sourcePath: string) {
  const sourceRoot = path.resolve(root)
  const resolvedSourcePath = path.resolve(String(sourcePath || ''))
  const relative = path.relative(sourceRoot, resolvedSourcePath)

  if (!relative || relative === '.' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid source path')
  }

  if (!fs.existsSync(resolvedSourcePath)) {
    throw new Error('Source file does not exist')
  }

  return resolvedSourcePath
}

async function moveFile(sourcePath: string, destinationPath: string) {
  try {
    await rename(sourcePath, destinationPath)
  } catch (error) {
    if (isExdevError(error)) {
      await copyFile(sourcePath, destinationPath)
      await unlink(sourcePath)
      return
    }

    throw error
  }
}

function isExdevError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EXDEV'
}

import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PreviewItem } from '../import/types'
import { applyPreviewItems } from './runner'

describe('applyPreviewItems', () => {
  let tempRoot: string
  let sourceRoot: string
  let targetRoot: string
  let originalImgExportData: string | undefined
  let originalImgExportTarget: string | undefined

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'apply-runner-test-'))
    sourceRoot = path.join(tempRoot, 'source')
    targetRoot = path.join(tempRoot, 'target')
    await mkdir(sourceRoot, { recursive: true })
    await mkdir(targetRoot, { recursive: true })
    originalImgExportData = process.env.IMG_EXPORT_DATA
    originalImgExportTarget = process.env.IMG_EXPORT_TARGET
    process.env.IMG_EXPORT_DATA = sourceRoot
    process.env.IMG_EXPORT_TARGET = targetRoot
  })

  afterEach(async () => {
    if (originalImgExportData === undefined) {
      delete process.env.IMG_EXPORT_DATA
    } else {
      process.env.IMG_EXPORT_DATA = originalImgExportData
    }

    if (originalImgExportTarget === undefined) {
      delete process.env.IMG_EXPORT_TARGET
    } else {
      process.env.IMG_EXPORT_TARGET = originalImgExportTarget
    }

    await rm(tempRoot, { recursive: true, force: true })
  })

  test('rejects destination traversal with relative parent path', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/photo.jpg', 'photo-a')
    const results = await applyPreviewItems(
      [createPreviewItem(sourcePath, '../escape')],
      targetRoot,
      'copy',
    )

    assert.equal(results[0].status, 'failed')
    assert.equal(results[0].error, 'Invalid destination path')
    assert.equal(results[0].destinationPath, null)
  })

  test('rejects destination traversal with absolute-like path', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/photo.jpg', 'photo-b')
    const results = await applyPreviewItems(
      [createPreviewItem(sourcePath, '/escape')],
      targetRoot,
      'copy',
    )

    assert.equal(results[0].status, 'failed')
    assert.equal(results[0].error, 'Invalid destination path')
    assert.equal(results[0].destinationPath, null)
  })

  test('rejects source boundary escape', async () => {
    const outsidePath = await createFile(tempRoot, 'outside/photo.jpg', 'photo-c')
    const results = await applyPreviewItems(
      [createPreviewItem(outsidePath, '2023/08')],
      targetRoot,
      'copy',
    )

    assert.equal(results[0].status, 'failed')
    assert.equal(results[0].error, 'Invalid source path')
    assert.equal(results[0].destinationPath, null)
  })

  test('rejects missing source file inside source root', async () => {
    const missingPath = path.join(sourceRoot, 'nested/missing.jpg')
    const results = await applyPreviewItems(
      [createPreviewItem(missingPath, '2023/08')],
      targetRoot,
      'copy',
    )

    assert.equal(results[0].status, 'failed')
    assert.equal(results[0].error, 'Source file does not exist')
    assert.equal(results[0].destinationPath, null)
  })

  test('copies a valid source file successfully', async () => {
    const sourcePath = await createFile(sourceRoot, 'camera/photo.jpg', 'photo-d')
    const results = await applyPreviewItems(
      [createPreviewItem(sourcePath, '2023/08')],
      targetRoot,
      'copy',
    )
    const result = results[0]

    assert.equal(result.status, 'success')
    assert.ok(result.destinationPath)
    assert.equal(path.basename(result.destinationPath), path.basename(sourcePath))
    assert.ok(path.resolve(result.destinationPath).startsWith(path.resolve(targetRoot) + path.sep))
    assert.equal(await fileExists(sourcePath), true)
    assert.equal(await fileExists(result.destinationPath), true)
    assert.deepEqual(await readFile(result.destinationPath, 'utf8'), 'photo-d')
  })

  test('moves a valid source file successfully', async () => {
    const sourcePath = await createFile(sourceRoot, 'camera/photo.jpg', 'photo-e')
    const results = await applyPreviewItems(
      [createPreviewItem(sourcePath, '2023/08')],
      targetRoot,
      'move',
    )
    const result = results[0]

    assert.equal(result.status, 'success')
    assert.ok(result.destinationPath)
    assert.equal(path.basename(result.destinationPath), path.basename(sourcePath))
    assert.ok(path.resolve(result.destinationPath).startsWith(path.resolve(targetRoot) + path.sep))
    assert.equal(await fileExists(sourcePath), false)
    assert.equal(await fileExists(result.destinationPath), true)
    assert.deepEqual(await readFile(result.destinationPath, 'utf8'), 'photo-e')
  })

  test('always derives destination filename from basename(sourcePath)', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/deeper/custom-name.jpg', 'photo-f')
    const results = await applyPreviewItems(
      [createPreviewItem(sourcePath, '2024/01')],
      targetRoot,
      'copy',
    )
    const result = results[0]

    assert.equal(result.status, 'success')
    assert.ok(result.destinationPath)
    assert.equal(path.basename(result.destinationPath), 'custom-name.jpg')
  })
})

function createPreviewItem(sourcePath: string, targetDir: string): PreviewItem {
  return {
    sourcePath,
    filePath: sourcePath,
    meta: {
      filePath: sourcePath,
      fileName: path.basename(sourcePath),
      extension: path.extname(sourcePath).replace(/^\./, '').toLowerCase(),
      mimeType: 'image/jpeg',
      capturedAt: null,
      year: null,
      month: null,
      day: null,
      cameraMake: null,
      cameraModel: null,
      lensModel: null,
      gpsLat: null,
      gpsLng: null,
      gpsAltitude: null,
      width: null,
      height: null,
      orientation: null,
      sha256: 'deadbeefcafebabe',
    },
    geo: null,
    decision: {
      strategy: 'unknown',
      targetDir,
      confidence: 0.1,
      reason: ['insufficient_metadata'],
    },
  } as PreviewItem
}

async function createFile(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
  return filePath
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

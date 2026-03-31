import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import * as routeModule from './route'

describe('POST /api/exif_sorter/apply', () => {
  let tempRoot: string
  let sourceRoot: string
  let targetRoot: string
  let outsideRoot: string
  let originalImgExportData: string | undefined
  let originalImgExportTarget: string | undefined

  beforeEach(async () => {
    tempRoot = await createTempRoot()
    sourceRoot = path.join(tempRoot, 'source')
    targetRoot = path.join(tempRoot, 'target')
    outsideRoot = path.join(tempRoot, 'outside')
    await mkdir(sourceRoot, { recursive: true })
    await mkdir(targetRoot, { recursive: true })
    await mkdir(outsideRoot, { recursive: true })
    originalImgExportData = process.env.IMG_EXPORT_DATA
    originalImgExportTarget = process.env.IMG_EXPORT_TARGET
    process.env.IMG_EXPORT_DATA = toAllowedEnvPath(sourceRoot)
    process.env.IMG_EXPORT_TARGET = toAllowedEnvPath(targetRoot)
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

  test('rejects destination traversal with parent segments', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/photo.jpg', 'photo-a')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '../escape')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 1)
    assert.equal(payload.results[0].status, 'failed')
    assert.equal(payload.results[0].error, 'Invalid destination path')
  })

  test('rejects destination traversal with absolute-like path', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/photo.jpg', 'photo-b')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '/escape')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 1)
    assert.equal(payload.results[0].status, 'failed')
    assert.equal(payload.results[0].error, 'Invalid destination path')
  })

  test('rejects destination traversal with backslash absolute-like path', async () => {
    const sourcePath = await createFile(sourceRoot, 'nested/photo.jpg', 'photo-bb')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '\\escape')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 1)
    assert.equal(payload.results[0].status, 'failed')
    assert.equal(payload.results[0].error, 'Invalid destination path')
  })

  test('rejects source path outside IMG_EXPORT_DATA', async () => {
    const sourcePath = await createFile(outsideRoot, 'nested/photo.jpg', 'photo-c')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '2023/08')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 1)
    assert.equal(payload.results[0].status, 'failed')
    assert.equal(payload.results[0].error, 'Invalid source path')
  })

  test('rejects missing source file', async () => {
    const sourcePath = path.join(sourceRoot, 'nested/missing.jpg')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '2023/08')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 1)
    assert.equal(payload.results[0].status, 'failed')
    assert.equal(payload.results[0].error, 'Source file does not exist')
  })

  test('normal copy succeeds', async () => {
    const sourcePath = await createFile(sourceRoot, 'camera/photo.jpg', 'photo-d')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '2023/08')],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)
    const result = payload.results[0]

    assert.equal(payload.count, 1)
    assert.equal(result.status, 'success')
    assert.ok(result.destinationPath)
    assert.ok(isUnderRoot(targetRoot, result.destinationPath))
    assert.equal(await fileExists(sourcePath), true)
    assert.equal(await fileExists(result.destinationPath), true)
    assert.equal(await readFile(result.destinationPath, 'utf8'), 'photo-d')
  })

  test('normal move succeeds', async () => {
    const sourcePath = await createFile(sourceRoot, 'camera/photo.jpg', 'photo-e')
    const response = await postApply({
      items: [createApplyItem(sourcePath, '2023/08')],
      mode: 'move',
    })
    const payload = await assertBatchResponse(response)
    const result = payload.results[0]

    assert.equal(payload.count, 1)
    assert.equal(result.status, 'success')
    assert.ok(result.destinationPath)
    assert.ok(isUnderRoot(targetRoot, result.destinationPath))
    assert.equal(await fileExists(sourcePath), false)
    assert.equal(await fileExists(result.destinationPath), true)
    assert.equal(await readFile(result.destinationPath, 'utf8'), 'photo-e')
  })

  test('successful destination paths remain under IMG_EXPORT_TARGET', async () => {
    const firstSourcePath = await createFile(sourceRoot, 'nested/first.jpg', 'photo-f')
    const secondSourcePath = await createFile(sourceRoot, 'nested/second.jpg', 'photo-g')
    const response = await postApply({
      items: [
        createApplyItem(firstSourcePath, '2023/08'),
        createApplyItem(secondSourcePath, '2024/01'),
      ],
      mode: 'copy',
    })
    const payload = await assertBatchResponse(response)

    assert.equal(payload.count, 2)

    for (const result of payload.results) {
      assert.equal(result.status, 'success')
      assert.ok(result.destinationPath)
      assert.ok(isUnderRoot(targetRoot, result.destinationPath))
      const relative = path.relative(targetRoot, result.destinationPath)
      assert.equal(relative.startsWith('..'), false)
      assert.equal(path.isAbsolute(relative), false)
    }
  })
})

async function postApply(body: { items: unknown[]; mode: 'copy' | 'move' }) {
  const postHandler = routeModule.POST ?? routeModule.default?.POST
  assert.equal(typeof postHandler, 'function')

  return postHandler(
    new Request('http://localhost/api/exif_sorter/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  )
}

async function assertBatchResponse(response: Response) {
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(Array.isArray(payload.results), true)
  assert.equal(typeof payload.count, 'number')
  return payload as { ok: true; count: number; results: Array<Record<string, unknown>> }
}

function createApplyItem(sourcePath: string, targetDir: string) {
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
  }
}

async function createFile(root: string, relativePath: string, contents: string) {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
  return filePath
}

async function createTempRoot() {
  const basePath = path.join(process.cwd(), '.tmp', 'apply-route-test-')
  await mkdir(path.dirname(basePath), { recursive: true })
  return mkdtemp(basePath)
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

function isUnderRoot(root: string, destinationPath: string) {
  const resolvedRoot = path.resolve(root)
  const resolvedDestination = path.resolve(destinationPath)
  return (
    resolvedDestination === resolvedRoot ||
    resolvedDestination.startsWith(resolvedRoot + path.sep)
  )
}

function toAllowedEnvPath(realPath: string) {
  return `/mnt/..${realPath}`
}

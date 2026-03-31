import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { summarizeSortDecisions } from '../../../../../../lib/sort/diagnostics'
import * as routeModule from './route'

const exifFixtureSourcePath = '/volume1/hwi/config/static/gimg/Screenshot_20241205_152814_One UI Home.jpg'

describe('POST /api/exif_sorter/preview', () => {
  let tempRoot: string
  let sourceRoot: string
  let originalImgExportData: string | undefined

  beforeEach(async () => {
    tempRoot = await createTempRoot()
    sourceRoot = path.join(tempRoot, 'source')
    await mkdir(sourceRoot, { recursive: true })
    originalImgExportData = process.env.IMG_EXPORT_DATA
    process.env.IMG_EXPORT_DATA = toAllowedEnvPath(sourceRoot)
  })

  afterEach(async () => {
    if (originalImgExportData === undefined) {
      delete process.env.IMG_EXPORT_DATA
    } else {
      process.env.IMG_EXPORT_DATA = originalImgExportData
    }

    await rm(tempRoot, { recursive: true, force: true })
  })

  test('keeps EXIF-derived and mtime-derived date_only attribution distinguishable through preview response', async () => {
    const exifPath = await copyExifFixture('exif/photo-exif.jpg')
    const precedencePath = await copyExifFixture('exif/photo-precedence.jpg')
    const mtimePath = await createPlainJpg('mtime/photo-mtime.jpg', 'mtime-fallback')
    const mtimeDate = new Date('2022-08-09T10:11:12.000Z')
    const conflictingMtimeDate = new Date('2018-01-02T03:04:05.000Z')

    await utimes(mtimePath, mtimeDate, mtimeDate)
    await utimes(precedencePath, conflictingMtimeDate, conflictingMtimeDate)

    const response = await postPreview({})
    const payload = await assertPreviewResponse(response)

    assert.equal(payload.count, 3)

    const exifItem = findItemByFilePath(payload.items, exifPath)
    const precedenceItem = findItemByFilePath(payload.items, precedencePath)
    const mtimeItem = findItemByFilePath(payload.items, mtimePath)

    assert.equal(exifItem.decision.strategy, 'date_only')
    assert.deepEqual(exifItem.decision.reason, ['has_capture_date', 'missing_usable_location'])

    assert.equal(precedenceItem.decision.strategy, 'date_only')
    assert.equal(precedenceItem.decision.targetDir, '/2024/12/05')
    assert.deepEqual(precedenceItem.decision.reason, ['has_capture_date', 'missing_usable_location'])

    assert.equal(mtimeItem.decision.strategy, 'date_only')
    assert.equal(mtimeItem.decision.targetDir, '/2022/08/09')
    assert.deepEqual(mtimeItem.decision.reason, ['missing_capture_date', 'using_file_mtime'])
  })

  test('keeps unsupported metadata files stable and reports correct diagnostics counts', async () => {
    const exifPath = await copyExifFixture('diag/photo-exif.jpg')
    const precedencePath = await copyExifFixture('diag/photo-precedence.jpg')
    const mtimePath = await createPlainJpg('diag/photo-mtime.jpg', 'mtime-fallback')
    const brokenPath = await createPlainJpg('diag/photo-broken.jpg', '')
    const mtimeDate = new Date('2022-08-09T10:11:12.000Z')
    const brokenDate = new Date('2021-02-03T04:05:06.000Z')
    const conflictingMtimeDate = new Date('2018-01-02T03:04:05.000Z')

    await utimes(mtimePath, mtimeDate, mtimeDate)
    await utimes(brokenPath, brokenDate, brokenDate)
    await utimes(precedencePath, conflictingMtimeDate, conflictingMtimeDate)

    const response = await postPreview({
      inputDir: '/tmp/should-be-ignored',
    })
    const payload = await assertPreviewResponse(response)

    assert.equal(payload.count, 4)

    const brokenItem = findItemByFilePath(payload.items, brokenPath)
    assert.equal(brokenItem.decision.strategy, 'date_only')
    assert.deepEqual(brokenItem.decision.reason, ['missing_capture_date', 'using_file_mtime'])

    const summary = summarizeSortDecisions(payload.items.map((item) => item.decision))

    assert.deepEqual(summary, {
      gpsDateCount: 0,
      exifDateOnlyCount: 2,
      mtimeFallbackCount: 2,
      unknownCount: 0,
    })

    assert.equal(findItemByFilePath(payload.items, exifPath).decision.strategy, 'date_only')
    assert.equal(findItemByFilePath(payload.items, precedencePath).decision.strategy, 'date_only')
    assert.equal(findItemByFilePath(payload.items, mtimePath).decision.strategy, 'date_only')
  })
})

async function postPreview(body: Record<string, unknown>) {
  const postHandler = routeModule.POST ?? routeModule.default?.POST
  assert.equal(typeof postHandler, 'function')

  return postHandler(
    new Request('http://localhost/api/exif_sorter/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
  )
}

async function assertPreviewResponse(response: Response) {
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.equal(payload.truncated, false)
  assert.equal(Array.isArray(payload.items), true)
  assert.equal(typeof payload.count, 'number')
  return payload as {
    ok: true
    count: number
    truncated: boolean
    items: Array<{
      filePath: string
      decision: {
        strategy: string
        targetDir: string
        confidence: number
        reason: string[]
      }
    }>
  }
}

function findItemByFilePath(
  items: Array<{
    filePath: string
    decision: {
      strategy: string
      targetDir: string
      confidence: number
      reason: string[]
    }
  }>,
  filePath: string,
) {
  const item = items.find((candidate) => path.resolve(candidate.filePath) === path.resolve(filePath))
  assert.ok(item)
  return item
}

async function copyExifFixture(relativePath: string) {
  const filePath = path.join(sourceRootGlobal(), relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await copyFile(exifFixtureSourcePath, filePath)
  return filePath
}

async function createPlainJpg(relativePath: string, contents: string) {
  const filePath = path.join(sourceRootGlobal(), relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents, 'utf8')
  return filePath
}

let currentSourceRoot = ''

function sourceRootGlobal() {
  return currentSourceRoot
}

async function createTempRoot() {
  const basePath = path.join(os.tmpdir(), 'preview-route-test-')
  return mkdtemp(basePath)
}

function toAllowedEnvPath(realPath: string) {
  currentSourceRoot = realPath
  return `/mnt/..${realPath}`
}

import assert from 'node:assert/strict'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { PhotoMeta } from '../exif/types'
import { decidePhotoTarget } from './decide'
import { summarizeSortDecisions } from './diagnostics'

describe('decidePhotoTarget mtime fallback', () => {
  let tempRoot: string

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sort-decide-test-'))
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  test('uses file mtime as date_only fallback when no EXIF date exists', async () => {
    const filePath = path.join(tempRoot, 'sample.jpg')
    await writeFile(filePath, 'sample', 'utf8')
    const fallbackDate = new Date('2024-01-02T03:04:05.000Z')
    await utimes(filePath, fallbackDate, fallbackDate)

    const decision = decidePhotoTarget(createMeta(filePath), null)

    assert.equal(decision.strategy, 'date_only')
    assert.equal(decision.targetDir, '/2024/01/02')
    assert.equal(decision.confidence, 0.35)
    assert.deepEqual(decision.reason, ['missing_capture_date', 'using_file_mtime'])
  })

  test('keeps EXIF-derived date_only distinguishable from mtime-derived date_only', async () => {
    const exifFilePath = path.join(tempRoot, 'exif.jpg')
    const mtimeFilePath = path.join(tempRoot, 'mtime.jpg')
    await writeFile(exifFilePath, 'exif', 'utf8')
    await writeFile(mtimeFilePath, 'mtime', 'utf8')
    const fallbackDate = new Date('2024-01-02T03:04:05.000Z')
    await utimes(mtimeFilePath, fallbackDate, fallbackDate)

    const exifDecision = decidePhotoTarget(
      createMeta(exifFilePath, {
        capturedAt: '2023-09-21T07:39:03.000Z',
        year: '2023',
        month: '09',
        day: '21',
      }),
      null,
    )
    const mtimeDecision = decidePhotoTarget(createMeta(mtimeFilePath), null)

    assert.equal(exifDecision.strategy, 'date_only')
    assert.deepEqual(exifDecision.reason, ['has_capture_date', 'missing_usable_location'])
    assert.equal(mtimeDecision.strategy, 'date_only')
    assert.deepEqual(mtimeDecision.reason, ['missing_capture_date', 'using_file_mtime'])
  })

  test('keeps EXIF date precedence over mtime fallback when EXIF date exists', async () => {
    const filePath = path.join(tempRoot, 'precedence.jpg')
    await writeFile(filePath, 'precedence', 'utf8')
    const fallbackDate = new Date('2024-01-02T03:04:05.000Z')
    await utimes(filePath, fallbackDate, fallbackDate)

    const decision = decidePhotoTarget(
      createMeta(filePath, {
        capturedAt: '2021-05-06T01:02:03.000Z',
        year: '2021',
        month: '05',
        day: '06',
      }),
      null,
    )

    assert.equal(decision.strategy, 'date_only')
    assert.equal(decision.targetDir, '/2021/05/06')
    assert.equal(decision.confidence, 0.75)
    assert.deepEqual(decision.reason, ['has_capture_date', 'missing_usable_location'])
  })

  test('remains unknown when no EXIF date exists and file stat is unavailable', () => {
    const filePath = path.join(tempRoot, 'missing.jpg')

    const decision = decidePhotoTarget(createMeta(filePath), null)

    assert.equal(decision.strategy, 'unknown')
    assert.equal(decision.targetDir, '/unknown')
    assert.equal(decision.confidence, 0.1)
    assert.deepEqual(decision.reason, ['insufficient_metadata'])
  })

  test('summarizes gps, exif date_only, mtime fallback, and unknown counts', async () => {
    const gpsFilePath = path.join(tempRoot, 'gps.jpg')
    const exifFilePath = path.join(tempRoot, 'exif.jpg')
    const mtimeFilePath = path.join(tempRoot, 'mtime.jpg')
    await writeFile(gpsFilePath, 'gps', 'utf8')
    await writeFile(exifFilePath, 'exif', 'utf8')
    await writeFile(mtimeFilePath, 'mtime', 'utf8')
    const fallbackDate = new Date('2024-01-02T03:04:05.000Z')
    await utimes(mtimeFilePath, fallbackDate, fallbackDate)

    const decisions = [
      decidePhotoTarget(
        createMeta(gpsFilePath, {
          capturedAt: '2023-09-21T07:39:03.000Z',
          year: '2023',
          month: '09',
        }),
        {
          lat: 37.1,
          lng: 127.1,
          cacheKey: '37.1000,127.1000',
          formattedAddress: 'Address',
          country: 'South Korea',
          adminArea1: 'Gangwon-do',
          adminArea2: null,
          locality: 'Hongcheon',
          sublocality: null,
          postalCode: null,
          placeId: null,
          source: 'google',
        },
      ),
      decidePhotoTarget(
        createMeta(exifFilePath, {
          capturedAt: '2023-09-21T07:39:03.000Z',
          year: '2023',
          month: '09',
          day: '21',
        }),
        null,
      ),
      decidePhotoTarget(createMeta(mtimeFilePath), null),
      decidePhotoTarget(createMeta(path.join(tempRoot, 'missing.jpg')), null),
    ]

    assert.deepEqual(summarizeSortDecisions(decisions), {
      gpsDateCount: 1,
      exifDateOnlyCount: 1,
      mtimeFallbackCount: 1,
      unknownCount: 1,
    })
  })
})

function createMeta(
  filePath: string,
  overrides: Partial<Pick<PhotoMeta, 'capturedAt' | 'year' | 'month' | 'day'>> = {},
): PhotoMeta {
  return {
    filePath,
    fileName: path.basename(filePath),
    extension: path.extname(filePath).replace(/^\./, '').toLowerCase(),
    mimeType: null,
    capturedAt: overrides.capturedAt ?? null,
    year: overrides.year ?? null,
    month: overrides.month ?? null,
    day: overrides.day ?? null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    gpsLat: null,
    gpsLng: null,
    gpsAltitude: null,
    width: null,
    height: null,
    orientation: null,
    sha256: 'deadbeef',
  }
}

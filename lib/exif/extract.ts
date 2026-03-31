import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import { basename, extname } from 'path';
import * as exifr from 'exifr';
import type { PhotoMeta } from './types';

type ExifData = {
  DateTimeOriginal?: Date | string | null;
  CreateDate?: Date | string | null;
  Make?: string | null;
  Model?: string | null;
  LensModel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  MIMEType?: string | null;
  ImageWidth?: number | null;
  ImageHeight?: number | null;
  Orientation?: number | null;
};

export async function extractPhotoMeta(filePath: string): Promise<PhotoMeta> {
  const fileName = basename(filePath);
  const extension = extname(filePath).replace(/^\./, '').toLowerCase();

  let buffer = Buffer.alloc(0);

  try {
    buffer = await readFile(filePath);
  } catch {
    return {
      filePath,
      fileName,
      extension,
      mimeType: null,
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
      sha256: createHash('sha256').update('').digest('hex'),
    };
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex');

  let exif: ExifData | null = null;

  try {
    exif = (await exifr.parse(buffer)) as ExifData | null;
  } catch {
    exif = null;
  }

  const capturedAt = toIsoString(exif?.DateTimeOriginal) ?? toIsoString(exif?.CreateDate);
  const dateParts = capturedAt ? capturedAt.slice(0, 10).split('-') : [];

  return {
    filePath,
    fileName,
    extension,
    mimeType: toStringOrNull(exif?.MIMEType),
    capturedAt,
    year: dateParts[0] ?? null,
    month: dateParts[1] ?? null,
    day: dateParts[2] ?? null,
    cameraMake: toStringOrNull(exif?.Make),
    cameraModel: toStringOrNull(exif?.Model),
    lensModel: toStringOrNull(exif?.LensModel),
    gpsLat: toNumberOrNull(exif?.latitude),
    gpsLng: toNumberOrNull(exif?.longitude),
    gpsAltitude: toNumberOrNull(exif?.altitude),
    width: toNumberOrNull(exif?.ImageWidth),
    height: toNumberOrNull(exif?.ImageHeight),
    orientation: toNumberOrNull(exif?.Orientation),
    sha256,
  };
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toStringOrNull(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toNumberOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

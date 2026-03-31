import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import type { GeoInfo } from './types';

const cacheFilePath = resolve(process.cwd(), 'data/geo_cache.json');

export function toGeoCacheKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

export async function readGeoCache(): Promise<Record<string, GeoInfo>> {
  try {
    const raw = await readFile(cacheFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, GeoInfo>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeGeoCache(cache: Record<string, GeoInfo>): Promise<void> {
  await mkdir(dirname(cacheFilePath), { recursive: true });
  await writeFile(cacheFilePath, JSON.stringify(cache, null, 2), 'utf8');
}

export async function getCachedGeoInfo(lat: number, lng: number): Promise<GeoInfo | null> {
  const cache = await readGeoCache();
  const cacheKey = toGeoCacheKey(lat, lng);
  return cache[cacheKey] ?? null;
}

export async function setCachedGeoInfo(geoInfo: GeoInfo): Promise<void> {
  const cache = await readGeoCache();
  cache[geoInfo.cacheKey] = geoInfo;
  await writeGeoCache(cache);
}

function roundCoord(value: number) {
  return value.toFixed(4);
}

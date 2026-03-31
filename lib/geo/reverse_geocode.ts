import { getCachedGeoInfo, setCachedGeoInfo, toGeoCacheKey } from './cache';
import { fetchGoogleGeoInfo } from './google';
import type { GeoInfo } from './types';

export async function reverseGeocode(lat: number, lng: number): Promise<GeoInfo | null> {
  const cached = await getCachedGeoInfo(lat, lng);

  if (cached) {
    return {
      ...cached,
      source: 'cache',
    };
  }

  const fetched = await fetchGoogleGeoInfo(lat, lng);

  if (fetched) {
    await setCachedGeoInfo(fetched);
    return fetched;
  }

  return buildEmptyGeoInfo(lat, lng);
}

function buildEmptyGeoInfo(lat: number, lng: number): GeoInfo {
  return {
    lat,
    lng,
    cacheKey: toGeoCacheKey(lat, lng),
    formattedAddress: null,
    country: null,
    adminArea1: null,
    adminArea2: null,
    locality: null,
    sublocality: null,
    postalCode: null,
    placeId: null,
    source: 'none',
  };
}

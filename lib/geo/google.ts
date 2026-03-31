import { toGeoCacheKey } from './cache';
import type { GeoInfo, GoogleGeocodingResponse } from './types';

export async function fetchGoogleGeoInfo(lat: number, lng: number): Promise<GeoInfo | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const searchParams = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
    language: 'en',
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${searchParams.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GoogleGeocodingResponse;

    if (data.status !== 'OK' || !data.results?.length) {
      return null;
    }

    const firstResult = data.results[0];
    const components = firstResult.address_components ?? [];

    return {
      lat,
      lng,
      cacheKey: toGeoCacheKey(lat, lng),
      formattedAddress: toStringOrNull(firstResult.formatted_address),
      country: findAddressComponent(components, 'country'),
      adminArea1: findAddressComponent(components, 'administrative_area_level_1'),
      adminArea2: findAddressComponent(components, 'administrative_area_level_2'),
      locality: findAddressComponent(components, 'locality'),
      sublocality: findAddressComponent(components, 'sublocality'),
      postalCode: findAddressComponent(components, 'postal_code'),
      placeId: toStringOrNull(firstResult.place_id),
      source: 'google',
    };
  } catch {
    return null;
  }
}

function findAddressComponent(
  components: NonNullable<GoogleGeocodingResponse['results']>[number]['address_components'],
  type: string,
) {
  const match = components?.find((component) => component.types?.includes(type));
  return toStringOrNull(match?.long_name);
}

function toStringOrNull(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export type GeoInfo = {
  lat: number;
  lng: number;
  cacheKey: string;
  formattedAddress: string | null;
  country: string | null;
  adminArea1: string | null;
  adminArea2: string | null;
  locality: string | null;
  sublocality: string | null;
  postalCode: string | null;
  placeId: string | null;
  source: 'google' | 'cache' | 'none';
};

export type GoogleGeocodingResponse = {
  results?: Array<{
    formatted_address?: string;
    place_id?: string;
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
  }>;
  status?: string;
};

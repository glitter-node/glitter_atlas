export const projectName = 'GlitterAtlas';

export type ServiceName = 'web' | 'api' | 'worker';

export function formatServiceLabel(service: ServiceName) {
  return `${projectName}:${service}`;
}

export type PhotoId = string;
export type PhotoAssetId = string;

export type PhotoUploadLocationInput = {
  latitude: number;
  longitude: number;
  name?: string;
};

export type CreatePhotoUploadInput = {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  title?: string;
  description?: string;
  capturedAt?: string;
  location?: PhotoUploadLocationInput;
};

export type PhotoRecord = {
  id: PhotoId;
  title: string | null;
  description: string | null;
  capturedAt: string | null;
  mimeType: string | null;
  visibility: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type PhotoLocationRecord = {
  photoId: PhotoId;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  accuracyMeters: number | null;
  placeId: string | null;
  countryCode: string | null;
  admin1: string | null;
  admin2: string | null;
  locality: string | null;
  sublocality: string | null;
  route: string | null;
  formattedAddress: string | null;
  geocodeProvider: string | null;
  geocodeVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PhotoAssetRecord = {
  id: PhotoAssetId;
  photoId: PhotoId;
  kind: string;
  bucket: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  etag: string | null;
  isOriginal: boolean;
  createdAt: string;
};

export type CreatePhotoUploadResponse = {
  photo: PhotoRecord;
  location: PhotoLocationRecord | null;
  asset: PhotoAssetRecord;
  uploadUrl: string;
  uploadMethod: 'PUT';
  expiresInSeconds: number;
};

export type CompletePhotoUploadInput = {
  objectKey: string;
};

export type CompletePhotoUploadResponse = {
  photoId: PhotoId;
  objectKey: string;
  exists: boolean;
  asset: PhotoAssetRecord;
  refreshedMetadata: {
    etag: string | null;
    sizeBytes: number | null;
  } | null;
};

export type GetPhotoResponse = {
  photo: PhotoRecord;
  location: PhotoLocationRecord | null;
  asset: PhotoAssetRecord | null;
};

export type CleanupAbandonedUploadsInput = {
  limit?: number;
};

export type CleanupAbandonedUploadsResponse = {
  scannedCount: number;
  abandonedCount: number;
  cutoff: string;
};

export type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'approved' | null;
  email: string | null;
  isSuperAdmin: boolean;
};

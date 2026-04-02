import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CleanupAbandonedUploadsInput,
  CleanupAbandonedUploadsResponse,
  CompletePhotoUploadInput,
  CompletePhotoUploadResponse,
  CreatePhotoUploadInput,
  CreatePhotoUploadResponse,
  DEFAULT_CLEANUP_BATCH_LIMIT,
  DEFAULT_UPLOAD_PENDING_TIMEOUT_MINUTES,
  GetPhotoResponse,
  MAX_CLEANUP_BATCH_LIMIT,
  PHOTO_STATUS_ABANDONED,
  PHOTO_STATUS_PENDING,
  PhotoAssetRecord,
  PhotoLocationRecord,
  PhotoRecord,
} from '@glitter-atlas/shared';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import {
  StorageIntegrationError,
  StorageService,
} from '../storage/storage.service';

const UNKNOWN_COUNTRY = 'UNKNOWN_COUNTRY';
const UNKNOWN_LOCALITY = 'UNKNOWN_LOCALITY';
const UNKNOWN_DATE = 'UNKNOWN_DATE';
const GEOCODE_VERSION = 'google-geocoding-v1';
const PHOTO_VISIBILITY_PRIVATE = 'private';
const PHOTO_VISIBILITY_SHARED = 'shared';


type PhotoOwnerContext = {
  approvedUserId: number;
};

type AdminPhotoFiltersInput = {
  userId?: string;
  visibility?: string;
  includeDeleted?: string;
  createdFrom?: string;
  createdTo?: string;
};

type AdminPhotoFilters = {
  userId: number | null;
  visibility: 'private' | 'shared' | null;
  includeDeleted: boolean;
  createdFrom: Date | null;
  createdTo: Date | null;
};

type DbPhotoRow = {
  id: string;
  title: string | null;
  description: string | null;
  captured_at: Date | string | null;
  mime_type: string | null;
  visibility: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
};

type DbAdminPhotoRow = DbPhotoRow & {
  user_id: number | null;
};

type DbLocationRow = {
  photo_id: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  accuracy_meters: number | null;
  place_id: string | null;
  country_code: string | null;
  admin1: string | null;
  admin2: string | null;
  locality: string | null;
  sublocality: string | null;
  route: string | null;
  formatted_address: string | null;
  geocode_provider: string | null;
  geocode_version: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type DbAssetRow = {
  id: string;
  photo_id: string;
  kind: string;
  bucket: string;
  object_key: string;
  mime_type: string;
  size_bytes: string;
  width: number | null;
  height: number | null;
  etag: string | null;
  is_original: boolean;
  created_at: Date | string;
};

type UploadLocationMetadata = {
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
};

@Injectable()
export class PhotosService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(StorageService)
    private readonly storageService: StorageService,
  ) {
    console.log('[api] PhotosService.constructor');
  }

  async createUpload(
    input: CreatePhotoUploadInput,
    owner: PhotoOwnerContext,
  ): Promise<CreatePhotoUploadResponse> {
    this.validateInput(input);

    const assetId = randomUUID();
    const uploadKeySeed = randomUUID();
    const locationMetadata = input.location
      ? await this.reverseGeocodeUploadLocation(
          input.location.latitude,
          input.location.longitude,
        )
      : null;
    const objectKey = this.buildObjectKey({
      uploadKeySeed,
      assetId,
      fileName: input.fileName,
      capturedAt: input.capturedAt,
      countryCode: locationMetadata?.countryCode ?? null,
      locality: locationMetadata?.locality ?? locationMetadata?.sublocality ?? null,
    });

    try {
      const upload = await this.storageService.createUploadUrl({
        objectKey,
        mimeType: input.mimeType,
      });

      const checksum = createHash('sha256').update(objectKey).digest('hex');
      const client = await this.databaseService.pool.connect();

      await client.query('begin');

      try {
        const photoResult = await client.query<DbPhotoRow>(
          `
            insert into photos (user_id, title, description, captured_at, mime_type, checksum_sha256, visibility)
            values ($1, $2, $3, $4, $5, $6, $7)
            returning id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
          `,
          [
            owner.approvedUserId,
            input.title ?? null,
            input.description ?? null,
            input.capturedAt ? new Date(input.capturedAt) : null,
            input.mimeType,
            checksum,
            PHOTO_VISIBILITY_PRIVATE,
          ],
        );

        const photoRow = photoResult.rows[0];

        let locationRow: DbLocationRow | null = null;

        if (input.location) {
          const locationResult = await client.query<DbLocationRow>(
            `
              insert into photo_locations (
                photo_id,
                latitude,
                longitude,
                place_id,
                country_code,
                admin1,
                admin2,
                locality,
                sublocality,
                route,
                formatted_address,
                geocode_provider,
                geocode_version
              )
              values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              on conflict (photo_id) do update
              set latitude = excluded.latitude,
                  longitude = excluded.longitude,
                  place_id = excluded.place_id,
                  country_code = excluded.country_code,
                  admin1 = excluded.admin1,
                  admin2 = excluded.admin2,
                  locality = excluded.locality,
                  sublocality = excluded.sublocality,
                  route = excluded.route,
                  formatted_address = excluded.formatted_address,
                  geocode_provider = excluded.geocode_provider,
                  geocode_version = excluded.geocode_version,
                  updated_at = now()
              returning photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
            `,
            [
              photoRow.id,
              input.location.latitude,
              input.location.longitude,
              locationMetadata?.placeId ?? null,
              locationMetadata?.countryCode ?? null,
              locationMetadata?.admin1 ?? null,
              locationMetadata?.admin2 ?? null,
              locationMetadata?.locality ?? null,
              locationMetadata?.sublocality ?? null,
              locationMetadata?.route ?? null,
              locationMetadata?.formattedAddress ?? null,
              locationMetadata?.geocodeProvider ?? null,
              locationMetadata?.geocodeVersion ?? null,
            ],
          );

          locationRow = locationResult.rows[0];
        }

        const assetResult = await client.query<DbAssetRow>(
          `
            insert into photo_assets (photo_id, kind, bucket, object_key, mime_type, size_bytes, is_original)
            values ($1, 'original', $2, $3, $4, $5, true)
            returning id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
          `,
          [
            photoRow.id,
            upload.bucket,
            objectKey,
            input.mimeType,
            input.sizeBytes ?? 0,
          ],
        );

        await client.query('commit');

        return {
          photo: this.mapPhoto(photoRow),
          location: locationRow ? this.mapLocation(locationRow) : null,
          asset: this.mapAsset(assetResult.rows[0]),
          uploadUrl: upload.uploadUrl,
          uploadMethod: 'PUT',
          expiresInSeconds: upload.expiresInSeconds,
        };
      } catch (error) {
        await client.query('rollback');

        if (this.isPgError(error) && error.code === '23505') {
          throw new ConflictException('photo upload conflict');
        }

        if (
          this.isPgError(error) &&
          (error.code === '08000' ||
            error.code === '08001' ||
            error.code === '08003' ||
            error.code === '08004' ||
            error.code === '08006' ||
            error.code === '08007' ||
            error.code === '08P01')
        ) {
          throw new BadGatewayException('database write failed');
        }

        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof StorageIntegrationError) {
        throw new BadGatewayException('storage upload URL generation failed');
      }

      throw error instanceof Error
        ? error
        : new InternalServerErrorException('upload failed');
    }
  }

  async completeUpload(
    photoId: string,
    input: CompletePhotoUploadInput & PhotoOwnerContext,
  ): Promise<CompletePhotoUploadResponse> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);

    if (!input.objectKey?.trim()) {
      throw new BadRequestException('objectKey is required');
    }

    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        where id = $1
          and user_id = $2
          and deleted_at is null
        limit 1
      `,
      [normalizedPhotoId, input.approvedUserId],
    );

    if (photoResult.rows.length === 0) {
      throw new NotFoundException('photo not found');
    }

    const photoRow = photoResult.rows[0];

    if (photoRow.status !== 'pending') {
      throw new ConflictException('photo is not pending');
    }

    const assetResult = await this.databaseService.pool.query<DbAssetRow>(
      `
        select id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        from photo_assets
        where photo_id = $1
          and object_key = $2
        limit 1
      `,
      [normalizedPhotoId, input.objectKey],
    );

    if (assetResult.rows.length === 0) {
      throw new NotFoundException('photo asset not found');
    }

    const assetRow = assetResult.rows[0];
    let metadata: Awaited<ReturnType<StorageService['getObjectMetadata']>>;

    try {
      metadata = await this.storageService.getObjectMetadata(
        assetRow.bucket,
        assetRow.object_key,
      );
    } catch (error) {
      if (error instanceof StorageIntegrationError) {
        throw new BadGatewayException('storage lookup failed');
      }

      throw error;
    }

    if (!metadata.exists) {
      throw new BadRequestException('object does not exist');
    }

    let currentAssetRow = assetRow;
    let refreshedMetadata: CompletePhotoUploadResponse['refreshedMetadata'] =
      null;
    const nextEtag =
      metadata.etag !== null && metadata.etag !== assetRow.etag
        ? metadata.etag
        : assetRow.etag;
    const nextSizeBytes =
      metadata.sizeBytes !== null &&
      metadata.sizeBytes !== Number(assetRow.size_bytes)
        ? metadata.sizeBytes
        : Number(assetRow.size_bytes);

    if (
      nextEtag !== assetRow.etag ||
      nextSizeBytes !== Number(assetRow.size_bytes)
    ) {
      const updatedAssetResult = await this.databaseService.pool.query<DbAssetRow>(
        `
          update photo_assets
          set etag = $2,
              size_bytes = $3
          where id = $1
          returning id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        `,
        [assetRow.id, nextEtag, nextSizeBytes],
      );

      currentAssetRow = updatedAssetResult.rows[0];
      refreshedMetadata = {
        etag: currentAssetRow.etag,
        sizeBytes: Number(currentAssetRow.size_bytes),
      };
    }

    await this.databaseService.pool.query<DbPhotoRow>(
      `
        update photos
        set status = 'ready',
            updated_at = now()
        where id = $1
          and user_id = $2
          and deleted_at is null
        returning id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
      `,
      [normalizedPhotoId, input.approvedUserId],
    );

    return {
      photoId: String(currentAssetRow.photo_id),
      objectKey: currentAssetRow.object_key,
      exists: true,
      asset: this.mapAsset(currentAssetRow),
      refreshedMetadata,
    };
  }

  async getPhoto(
    photoId: string,
    owner: PhotoOwnerContext,
  ): Promise<GetPhotoResponse> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);

    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        where id = $1
          and deleted_at is null
          and (
            user_id = $2
            or visibility = $3
          )
        limit 1
      `,
      [normalizedPhotoId, owner.approvedUserId, PHOTO_VISIBILITY_SHARED],
    );

    if (photoResult.rows.length === 0) {
      throw new NotFoundException('photo not found');
    }

    const locationResult = await this.databaseService.pool.query<DbLocationRow>(
      `
        select photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
        from photo_locations
        where photo_id = $1
        limit 1
      `,
      [normalizedPhotoId],
    );

    const assetResult = await this.databaseService.pool.query<DbAssetRow>(
      `
        select id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        from photo_assets
        where photo_id = $1
        order by created_at asc, id asc
      `,
      [normalizedPhotoId],
    );

    return {
      photo: this.mapPhoto(photoResult.rows[0]),
      location: locationResult.rows[0]
        ? this.mapLocation(locationResult.rows[0])
        : null,
      asset: this.selectBestAsset(assetResult.rows),
    };
  }

  async listPhotos(
    owner: PhotoOwnerContext,
  ): Promise<{
    items: GetPhotoResponse[];
    nextCursor: string | null;
  }> {
    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        where user_id = $1
          and deleted_at is null
        order by created_at desc, id desc
      `,
      [owner.approvedUserId],
    );

    return this.buildPhotoListResponse(photoResult.rows);
  }

  async listSharedPhotos(): Promise<{
    items: GetPhotoResponse[];
    nextCursor: string | null;
  }> {
    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        where visibility = $1
          and deleted_at is null
        order by created_at desc, id desc
      `,
      [PHOTO_VISIBILITY_SHARED],
    );

    return this.buildPhotoListResponse(photoResult.rows);
  }

  async listAdminPhotos(
    input: AdminPhotoFiltersInput,
  ): Promise<{
    filters: {
      userId: string | null;
      visibility: 'private' | 'shared' | null;
      includeDeleted: boolean;
      createdFrom: string | null;
      createdTo: string | null;
    };
    items: Array<{
      photo: PhotoRecord & { userId: string | null };
      location: PhotoLocationRecord | null;
      asset: PhotoAssetRecord | null;
    }>;
  }> {
    const filters = this.normalizeAdminPhotoFilters(input);
    const values: Array<number | string | Date> = [];
    const conditions: string[] = [];

    if (filters.userId !== null) {
      values.push(filters.userId);
      conditions.push(`user_id = $${values.length}`);
    }

    if (filters.visibility !== null) {
      values.push(filters.visibility);
      conditions.push(`visibility = $${values.length}`);
    }

    if (!filters.includeDeleted) {
      conditions.push('deleted_at is null');
    }

    if (filters.createdFrom !== null) {
      values.push(filters.createdFrom);
      conditions.push(`created_at >= $${values.length}`);
    }

    if (filters.createdTo !== null) {
      values.push(filters.createdTo);
      conditions.push(`created_at <= $${values.length}`);
    }

    const whereClause =
      conditions.length > 0
        ? `where ${conditions.join('\n          and ')}`
        : '';

    const photoResult = await this.databaseService.pool.query<DbAdminPhotoRow>(
      `
        select id, user_id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        ${whereClause}
        order by created_at desc, id desc
      `,
      values,
    );

    return {
      filters: {
        userId: filters.userId === null ? null : String(filters.userId),
        visibility: filters.visibility,
        includeDeleted: filters.includeDeleted,
        createdFrom: filters.createdFrom ? filters.createdFrom.toISOString() : null,
        createdTo: filters.createdTo ? filters.createdTo.toISOString() : null,
      },
      items: await this.buildAdminPhotoListResponse(photoResult.rows),
    };
  }

  async getAdminPhoto(
    photoId: string,
  ): Promise<{
    photo: PhotoRecord & { userId: string | null };
    location: PhotoLocationRecord | null;
    asset: PhotoAssetRecord | null;
  }> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);

    const photoResult = await this.databaseService.pool.query<DbAdminPhotoRow>(
      `
        select id, user_id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        where id = $1
        limit 1
      `,
      [normalizedPhotoId],
    );

    if (photoResult.rows.length === 0) {
      throw new NotFoundException('photo not found');
    }

    const locationResult = await this.databaseService.pool.query<DbLocationRow>(
      `
        select photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
        from photo_locations
        where photo_id = $1
        limit 1
      `,
      [normalizedPhotoId],
    );

    const assetResult = await this.databaseService.pool.query<DbAssetRow>(
      `
        select id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        from photo_assets
        where photo_id = $1
        order by created_at asc, id asc
      `,
      [normalizedPhotoId],
    );

    return {
      photo: this.mapAdminPhoto(photoResult.rows[0]),
      location: locationResult.rows[0]
        ? this.mapLocation(locationResult.rows[0])
        : null,
      asset: this.selectBestAsset(assetResult.rows),
    };
  }

  async setPhotoVisibility(
    photoId: string,
    visibility: string | undefined,
    owner: PhotoOwnerContext,
  ): Promise<{ ok: true; photoId: string; visibility: 'private' | 'shared' }> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);
    const normalizedVisibility = this.normalizeVisibility(visibility);

    const photoResult = await this.databaseService.pool.query<{
      id: string;
      user_id: number | null;
      deleted_at: Date | string | null;
    }>(
      `
        select id, user_id, deleted_at
        from photos
        where id = $1
        limit 1
      `,
      [normalizedPhotoId],
    );

    if (photoResult.rows.length === 0) {
      throw new NotFoundException('photo not found');
    }

    const photoRow = photoResult.rows[0];

    if (photoRow.deleted_at) {
      throw new NotFoundException('photo not found');
    }

    if (photoRow.user_id !== owner.approvedUserId) {
      throw new ForbiddenException('photo ownership required');
    }

    const updatedResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        update photos
        set visibility = $2,
            updated_at = now()
        where id = $1
          and user_id = $3
          and deleted_at is null
        returning id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
      `,
      [normalizedPhotoId, normalizedVisibility, owner.approvedUserId],
    );

    if (updatedResult.rows.length === 0) {
      throw new ForbiddenException('photo ownership required');
    }

    return {
      ok: true,
      photoId: normalizedPhotoId,
      visibility: updatedResult.rows[0].visibility as 'private' | 'shared',
    };
  }

  async deletePhoto(
    photoId: string,
    owner: PhotoOwnerContext,
  ): Promise<{ ok: true; photoId: string; deleteMode: 'soft_delete' }> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);

    const photoResult = await this.databaseService.pool.query<{
      id: string;
      user_id: number | null;
      deleted_at: Date | string | null;
    }>(
      `
        select id, user_id, deleted_at
        from photos
        where id = $1
          and user_id = $2
          and deleted_at is null
        limit 1
      `,
      [normalizedPhotoId, owner.approvedUserId],
    );

    if (photoResult.rows.length === 0) {
      throw new NotFoundException('photo not found');
    }

    const photoRow = photoResult.rows[0];

    if (photoRow.user_id !== owner.approvedUserId) {
      throw new ForbiddenException('photo ownership required');
    }

    if (photoRow.deleted_at) {
      throw new NotFoundException('photo not found');
    }

    const updatedResult = await this.databaseService.pool.query<{ id: string }>(
      `
        update photos
        set deleted_at = now(),
            updated_at = now()
        where id = $1
          and user_id = $2
          and deleted_at is null
        returning id
      `,
      [normalizedPhotoId, owner.approvedUserId],
    );

    if (updatedResult.rows.length === 0) {
      throw new ForbiddenException('photo ownership required');
    }

    return {
      ok: true,
      photoId: normalizedPhotoId,
      deleteMode: 'soft_delete',
    };
  }

  private async buildAdminPhotoListResponse(
    photoRows: DbAdminPhotoRow[],
  ): Promise<Array<{
    photo: PhotoRecord & { userId: string | null };
    location: PhotoLocationRecord | null;
    asset: PhotoAssetRecord | null;
  }>> {
    if (photoRows.length === 0) {
      return [];
    }

    const photoIds = photoRows.map((row) => row.id);

    const locationResult = await this.databaseService.pool.query<DbLocationRow>(
      `
        select photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
        from photo_locations
        where photo_id = any($1::bigint[])
      `,
      [photoIds],
    );

    const assetResult = await this.databaseService.pool.query<DbAssetRow>(
      `
        select id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        from photo_assets
        where photo_id = any($1::bigint[])
        order by created_at asc, id asc
      `,
      [photoIds],
    );

    const locationByPhotoId = new Map<string, DbLocationRow>();
    for (const row of locationResult.rows) {
      locationByPhotoId.set(row.photo_id, row);
    }

    const assetsByPhotoId = new Map<string, DbAssetRow[]>();
    for (const row of assetResult.rows) {
      const existing = assetsByPhotoId.get(row.photo_id);
      if (existing) {
        existing.push(row);
      } else {
        assetsByPhotoId.set(row.photo_id, [row]);
      }
    }

    return photoRows.map((row) => ({
      photo: this.mapAdminPhoto(row),
      location: locationByPhotoId.get(row.id)
        ? this.mapLocation(locationByPhotoId.get(row.id)!)
        : null,
      asset: this.selectBestAsset(assetsByPhotoId.get(row.id) ?? []),
    }));
  }

  private async buildPhotoListResponse(
    photoRows: DbPhotoRow[],
  ): Promise<{
    items: GetPhotoResponse[];
    nextCursor: string | null;
  }> {
    if (photoRows.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const photoIds = photoRows.map((row) => row.id);

    const locationResult = await this.databaseService.pool.query<DbLocationRow>(
      `
        select photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
        from photo_locations
        where photo_id = any($1::bigint[])
      `,
      [photoIds],
    );

    const assetResult = await this.databaseService.pool.query<DbAssetRow>(
      `
        select id, photo_id, kind, bucket, object_key, mime_type, size_bytes, width, height, etag, is_original, created_at
        from photo_assets
        where photo_id = any($1::bigint[])
        order by created_at asc, id asc
      `,
      [photoIds],
    );

    const locationByPhotoId = new Map<string, DbLocationRow>();
    for (const row of locationResult.rows) {
      locationByPhotoId.set(row.photo_id, row);
    }

    const assetsByPhotoId = new Map<string, DbAssetRow[]>();
    for (const row of assetResult.rows) {
      const existing = assetsByPhotoId.get(row.photo_id);
      if (existing) {
        existing.push(row);
      } else {
        assetsByPhotoId.set(row.photo_id, [row]);
      }
    }

    return {
      items: photoRows.map((row) => ({
        photo: this.mapPhoto(row),
        location: locationByPhotoId.get(row.id)
          ? this.mapLocation(locationByPhotoId.get(row.id)!)
          : null,
        asset: this.selectBestAsset(assetsByPhotoId.get(row.id) ?? []),
      })),
      nextCursor: null,
    };
  }

  async cleanupAbandonedUploads(
    input?: CleanupAbandonedUploadsInput,
  ): Promise<CleanupAbandonedUploadsResponse> {
    const limit = this.normalizeCleanupLimit(input?.limit);
    const timeoutMinutes = this.getUploadPendingTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const candidateResult = await this.databaseService.pool.query<{
      column_name: string;
    } & {
      id: string;
    }>(
      `
        select p.id
        from photos p
        where p.status = $3
          and p.created_at < $1
          and p.user_id is not null
          and exists (
            select 1
            from photo_assets pa
            where pa.photo_id = p.id
          )
        order by p.created_at asc, p.id asc
        limit $2
      `,
      [cutoff, limit, PHOTO_STATUS_PENDING],
    );

    const photoIds = candidateResult.rows.map((row) => row.id);

    if (photoIds.length === 0) {
      return {
        scannedCount: 0,
        abandonedCount: 0,
        cutoff: cutoff.toISOString(),
      };
    }

    const updatedResult = await this.databaseService.pool.query<{
      id: string;
    }>(
      `
        update photos
        set status = $2,
            updated_at = now()
        where id = any($1::bigint[])
          and user_id is not null
        returning id
      `,
      [photoIds, PHOTO_STATUS_ABANDONED],
    );

    return {
      scannedCount: photoIds.length,
      abandonedCount: updatedResult.rows.length,
      cutoff: cutoff.toISOString(),
    };
  }

  private normalizeAdminPhotoFilters(input: AdminPhotoFiltersInput): AdminPhotoFilters {
    const userId = input.userId?.trim() ? this.normalizeNumericFilter(input.userId, 'user_id') : null;
    const visibility = input.visibility?.trim()
      ? this.normalizeVisibility(input.visibility)
      : null;
    const includeDeleted = this.normalizeBooleanFilter(input.includeDeleted);
    const createdFrom = this.normalizeOptionalDateFilter(input.createdFrom, 'created_from');
    const createdTo = this.normalizeOptionalDateFilter(input.createdTo, 'created_to');

    if (createdFrom && createdTo && createdFrom.getTime() > createdTo.getTime()) {
      throw new BadRequestException('created_from must be before created_to');
    }

    return {
      userId,
      visibility,
      includeDeleted,
      createdFrom,
      createdTo,
    };
  }

  private normalizeNumericFilter(value: string, label: string) {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(`${label} must be numeric`);
    }

    return Number(normalized);
  }

  private normalizeBooleanFilter(value?: string) {
    if (!value) {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  private normalizeOptionalDateFilter(value: string | undefined, label: string) {
    if (!value?.trim()) {
      return null;
    }

    const normalized = new Date(value);

    if (Number.isNaN(normalized.getTime())) {
      throw new BadRequestException(`${label} must be a valid ISO date`);
    }

    return normalized;
  }

  private normalizeVisibility(value: string | undefined): 'private' | 'shared' {
    if (value === PHOTO_VISIBILITY_PRIVATE || value === PHOTO_VISIBILITY_SHARED) {
      return value;
    }

    throw new BadRequestException('visibility must be private or shared');
  }

  private validateInput(input: CreatePhotoUploadInput) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Request body is required');
    }

    if (!input.fileName?.trim()) {
      throw new BadRequestException('fileName is required');
    }

    if (!input.mimeType?.trim()) {
      throw new BadRequestException('mimeType is required');
    }

    if (input.capturedAt && Number.isNaN(Date.parse(input.capturedAt))) {
      throw new BadRequestException('capturedAt must be a valid ISO date');
    }

    if (input.sizeBytes !== undefined && input.sizeBytes < 0) {
      throw new BadRequestException('sizeBytes must be positive');
    }

    if (input.location) {
      const { latitude, longitude } = input.location;
      if (latitude < -90 || latitude > 90) {
        throw new BadRequestException('location.latitude must be between -90 and 90');
      }
      if (longitude < -180 || longitude > 180) {
        throw new BadRequestException(
          'location.longitude must be between -180 and 180',
        );
      }
    }
  }

  private buildObjectKey(input: {
    uploadKeySeed: string;
    assetId: string;
    fileName: string;
    capturedAt?: string;
    countryCode: string | null;
    locality: string | null;
  }) {
    const prefix = this.normalizeStoragePrefix(process.env.IMG_EXPORT_TARGET);
    const countryCode = this.normalizeCountryCode(input.countryCode);
    const locality = this.normalizeLocality(input.locality);
    const exifDate = this.normalizeExifDate(input.capturedAt);
    const normalizedFileName = this.normalizeFileName(
      input.fileName,
      input.assetId || input.uploadKeySeed,
    );

    return [prefix, countryCode, locality, exifDate, normalizedFileName]
      .filter((segment) => segment.length > 0)
      .join('/');
  }

  private async reverseGeocodeUploadLocation(
    latitude: number,
    longitude: number,
  ): Promise<UploadLocationMetadata | null> {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    if (!apiKey) {
      return {
        placeId: null,
        countryCode: null,
        admin1: null,
        admin2: null,
        locality: null,
        sublocality: null,
        route: null,
        formattedAddress: null,
        geocodeProvider: 'none',
        geocodeVersion: GEOCODE_VERSION,
      };
    }

    const searchParams = new URLSearchParams({
      latlng: `${latitude},${longitude}`,
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
        return {
          placeId: null,
          countryCode: null,
          admin1: null,
          admin2: null,
          locality: null,
          sublocality: null,
          route: null,
          formattedAddress: null,
          geocodeProvider: 'none',
          geocodeVersion: GEOCODE_VERSION,
        };
      }

      const data = (await response.json()) as {
        status?: string;
        results?: Array<{
          formatted_address?: string;
          place_id?: string;
          address_components?: Array<{
            long_name?: string;
            short_name?: string;
            types?: string[];
          }>;
        }>;
      };

      if (data.status !== 'OK' || !data.results?.length) {
        return {
          placeId: null,
          countryCode: null,
          admin1: null,
          admin2: null,
          locality: null,
          sublocality: null,
          route: null,
          formattedAddress: null,
          geocodeProvider: 'none',
          geocodeVersion: GEOCODE_VERSION,
        };
      }

      const firstResult = data.results[0];
      const components = firstResult.address_components ?? [];

      return {
        placeId: this.toNonEmptyString(firstResult.place_id),
        countryCode: this.findAddressComponent(components, 'country', 'short_name'),
        admin1: this.findAddressComponent(
          components,
          'administrative_area_level_1',
          'long_name',
        ),
        admin2: this.findAddressComponent(
          components,
          'administrative_area_level_2',
          'long_name',
        ),
        locality: this.findAddressComponent(components, 'locality', 'long_name'),
        sublocality: this.findAddressComponent(
          components,
          'sublocality',
          'long_name',
        ),
        route: this.findAddressComponent(components, 'route', 'long_name'),
        formattedAddress: this.toNonEmptyString(firstResult.formatted_address),
        geocodeProvider: 'google',
        geocodeVersion: GEOCODE_VERSION,
      };
    } catch {
      return {
        placeId: null,
        countryCode: null,
        admin1: null,
        admin2: null,
        locality: null,
        sublocality: null,
        route: null,
        formattedAddress: null,
        geocodeProvider: 'none',
        geocodeVersion: GEOCODE_VERSION,
      };
    }
  }

  private findAddressComponent(
    components: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>,
    type: string,
    field: 'long_name' | 'short_name',
  ) {
    const component = components.find((item) => item.types?.includes(type));
    return this.toNonEmptyString(component?.[field]);
  }

  private toNonEmptyString(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeStoragePrefix(value?: string) {
    return (value ?? '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/{2,}/g, '/');
  }

  private normalizeCountryCode(value: string | null) {
    const normalized = value
      ?.trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .toUpperCase();

    return normalized || UNKNOWN_COUNTRY;
  }

  private normalizeLocality(value: string | null) {
    const normalized = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_{2,}/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '');

    return normalized || UNKNOWN_LOCALITY;
  }

  private normalizeExifDate(value?: string) {
    if (!value) {
      return UNKNOWN_DATE;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return UNKNOWN_DATE;
    }

    return [
      String(parsed.getUTCFullYear()).padStart(4, '0'),
      String(parsed.getUTCMonth() + 1).padStart(2, '0'),
      String(parsed.getUTCDate()).padStart(2, '0'),
    ].join('_');
  }

  private normalizeFileName(fileName: string, idSeed: string) {
    const trimmed = fileName.trim() || 'upload';
    const extensionMatch = trimmed.match(/(\.[^.]+)$/);
    const extension = extensionMatch
      ? extensionMatch[1].replace(/[^a-zA-Z0-9.]/g, '')
      : '';
    const stem = extension
      ? trimmed.slice(0, -extension.length)
      : trimmed;
    const normalizedStem = this.normalizePathSegment(stem, 'upload');
    const shortId = idSeed.replace(/-/g, '').slice(0, 6).toLowerCase();

    return extension
      ? `${normalizedStem}_${shortId}${extension}`
      : `${normalizedStem}_${shortId}`;
  }

  private normalizePathSegment(
    value: string | null | undefined,
    fallback: string,
  ) {
    const normalized = (value ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/]+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .replace(/_{2,}/g, '_')
      .replace(/^[_./-]+/, '')
      .replace(/[_./-]+$/, '');

    return normalized || fallback;
  }

  private normalizePhotoId(photoId: string) {
    if (!/^\d+$/.test(photoId)) {
      throw new BadRequestException('invalid photo id');
    }

    return photoId;
  }

  private normalizeCleanupLimit(limit?: number) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_CLEANUP_BATCH_LIMIT;
    }
    return Math.min(Math.floor(parsed), MAX_CLEANUP_BATCH_LIMIT);
  }

  private getUploadPendingTimeoutMinutes() {
    const raw = process.env.UPLOAD_PENDING_TIMEOUT_MINUTES;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_UPLOAD_PENDING_TIMEOUT_MINUTES;
    }
    return parsed;
  }

  private selectBestAsset(rows: DbAssetRow[]): PhotoAssetRecord | null {
    if (rows.length === 0) {
      return null;
    }

    const priority = new Map<string, number>([
      ['original', 0],
      ['display', 1],
      ['thumb', 2],
      ['derived', 3],
    ]);

    const sorted = [...rows].sort((left, right) => {
      const leftPriority = priority.get(left.kind) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = priority.get(right.kind) ?? Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const createdAtDiff =
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime();

      if (createdAtDiff !== 0) {
        return createdAtDiff;
      }

      return this.compareNumericStrings(left.id, right.id);
    });

    return this.mapAsset(sorted[0]);
  }

  private compareNumericStrings(left: string, right: string) {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);

    if (leftValue < rightValue) {
      return -1;
    }

    if (leftValue > rightValue) {
      return 1;
    }

    return 0;
  }

  private toIso(value: Date | string | null) {
    if (!value) {
      return null;
    }

    return new Date(value).toISOString();
  }

  private mapAdminPhoto(row: DbAdminPhotoRow): PhotoRecord & { userId: string | null } {
    return {
      ...this.mapPhoto(row),
      userId: row.user_id === null ? null : String(row.user_id),
    };
  }

  private mapPhoto(row: DbPhotoRow): PhotoRecord {
    return {
      id: String(row.id),
      title: row.title,
      description: row.description,
      capturedAt: this.toIso(row.captured_at),
      mimeType: row.mime_type,
      visibility: row.visibility,
      status: row.status,
      createdAt: this.toIso(row.created_at)!,
      updatedAt: this.toIso(row.updated_at)!,
      deletedAt: this.toIso(row.deleted_at),
    };
  }

  private mapLocation(row: DbLocationRow): PhotoLocationRecord {
    return {
      photoId: String(row.photo_id),
      latitude: row.latitude,
      longitude: row.longitude,
      altitude: row.altitude,
      accuracyMeters: row.accuracy_meters,
      placeId: row.place_id,
      countryCode: row.country_code,
      admin1: row.admin1,
      admin2: row.admin2,
      locality: row.locality,
      sublocality: row.sublocality,
      route: row.route,
      formattedAddress: row.formatted_address,
      geocodeProvider: row.geocode_provider,
      geocodeVersion: row.geocode_version,
      createdAt: this.toIso(row.created_at)!,
      updatedAt: this.toIso(row.updated_at)!,
    };
  }

  private mapAsset(row: DbAssetRow): PhotoAssetRecord {
    return {
      id: String(row.id),
      photoId: String(row.photo_id),
      kind: row.kind,
      bucket: row.bucket,
      objectKey: row.object_key,
      displayUrl: this.storageService.getObjectUrl(row.object_key),
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      width: row.width,
      height: row.height,
      etag: row.etag,
      isOriginal: row.is_original,
      createdAt: this.toIso(row.created_at)!,
    };
  }

  private isPgError(error: unknown): error is { code?: string } {
    return typeof error === 'object' && error !== null && 'code' in error;
  }
}

import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  CompletePhotoUploadInput,
  CompletePhotoUploadResponse,
  CleanupAbandonedUploadsInput,
  CleanupAbandonedUploadsResponse,
  CreatePhotoUploadInput,
  CreatePhotoUploadResponse,
  GetPhotoResponse,
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

type ListPhotosInput = {
  limit?: string;
  cursor?: string;
  status?: string;
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
  ): Promise<CreatePhotoUploadResponse> {
    this.validateInput(input);

    const assetId = randomUUID();
    const uploadKeySeed = randomUUID();
    const objectKey = this.buildObjectKey(
      uploadKeySeed,
      assetId,
      input.fileName,
    );

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
            insert into photos (title, description, captured_at, mime_type, checksum_sha256)
            values ($1, $2, $3, $4, $5)
            returning id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
          `,
          [
            input.title ?? null,
            input.description ?? null,
            input.capturedAt ? new Date(input.capturedAt) : null,
            input.mimeType,
            checksum,
          ],
        );

        const photoRow = photoResult.rows[0];

        let locationRow: DbLocationRow | null = null;

        if (input.location) {
          const locationResult = await client.query<DbLocationRow>(
            `
              insert into photo_locations (photo_id, latitude, longitude)
              values ($1, $2, $3)
              on conflict (photo_id) do update
              set latitude = excluded.latitude,
                  longitude = excluded.longitude,
                  updated_at = now()
              returning photo_id, latitude, longitude, altitude, accuracy_meters, place_id, country_code, admin1, admin2, locality, sublocality, route, formatted_address, geocode_provider, geocode_version, created_at, updated_at
            `,
            [photoRow.id, input.location.latitude, input.location.longitude],
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
    input: CompletePhotoUploadInput,
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
        limit 1
      `,
      [normalizedPhotoId],
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
        returning id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
      `,
      [normalizedPhotoId],
    );

    return {
      photoId: String(currentAssetRow.photo_id),
      objectKey: currentAssetRow.object_key,
      exists: true,
      asset: this.mapAsset(currentAssetRow),
      refreshedMetadata,
    };
  }

  async getPhoto(photoId: string): Promise<GetPhotoResponse> {
    const normalizedPhotoId = this.normalizePhotoId(photoId);

    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
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
      photo: this.mapPhoto(photoResult.rows[0]),
      location: locationResult.rows[0]
        ? this.mapLocation(locationResult.rows[0])
        : null,
      asset: this.selectBestAsset(assetResult.rows),
    };
  }

  async listPhotos(input: ListPhotosInput): Promise<{
    items: GetPhotoResponse[];
    nextCursor: string | null;
  }> {
    const limit = this.normalizeLimit(input.limit);
    const status = input.status?.trim() ? input.status.trim() : null;
    const cursor = this.parseCursor(input.cursor);
    const params: Array<string | Date | number> = [];
    let paramIndex = 1;
    let whereClause = '';

    if (status) {
      whereClause = `where status = $${paramIndex}`;
      params.push(status);
      paramIndex += 1;
    }

    if (cursor) {
      const cursorClause = `(created_at < $${paramIndex} or (created_at = $${paramIndex} and id < $${paramIndex + 1}))`;
      params.push(cursor.createdAt, cursor.id);
      paramIndex += 2;
      whereClause = whereClause
        ? `${whereClause} and ${cursorClause}`
        : `where ${cursorClause}`;
    }

    params.push(limit);

    const photoResult = await this.databaseService.pool.query<DbPhotoRow>(
      `
        select id, title, description, captured_at, mime_type, visibility, status, created_at, updated_at, deleted_at
        from photos
        ${whereClause}
        order by created_at desc, id desc
        limit $${paramIndex}
      `,
      params,
    );

    if (photoResult.rows.length === 0) {
      return {
        items: [],
        nextCursor: null,
      };
    }

    const photoIds = photoResult.rows.map((row) => row.id);

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

    const items = photoResult.rows.map((row) => ({
      photo: this.mapPhoto(row),
      location: locationByPhotoId.get(row.id)
        ? this.mapLocation(locationByPhotoId.get(row.id)!)
        : null,
      asset: this.selectBestAsset(assetsByPhotoId.get(row.id) ?? []),
    }));

    const lastRow = photoResult.rows[photoResult.rows.length - 1];

    return {
      items,
      nextCursor:
        photoResult.rows.length === limit
          ? this.encodeCursor({
              createdAt: this.toIso(lastRow.created_at)!,
              id: String(lastRow.id),
            })
          : null,
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
        where p.status = 'pending'
          and p.created_at < $1
          and exists (
            select 1
            from photo_assets pa
            where pa.photo_id = p.id
          )
        order by p.created_at asc, p.id asc
        limit $2
      `,
      [cutoff, limit],
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
        set status = 'abandoned',
            updated_at = now()
        where id = any($1::bigint[])
        returning id
      `,
      [photoIds],
    );

    return {
      scannedCount: photoIds.length,
      abandonedCount: updatedResult.rows.length,
      cutoff: cutoff.toISOString(),
    };
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

  private buildObjectKey(photoId: string, assetId: string, fileName: string) {
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `photos/${photoId}/${assetId}-${sanitized}`;
  }

  private normalizePhotoId(photoId: string) {
    if (!/^\d+$/.test(photoId)) {
      throw new BadRequestException('invalid photo id');
    }

    return photoId;
  }

  private normalizeLimit(limit?: string) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 20;
    }
    return Math.min(Math.floor(parsed), 100);
  }

  private normalizeCleanupLimit(limit?: number) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 100;
    }
    return Math.min(Math.floor(parsed), 1000);
  }

  private getUploadPendingTimeoutMinutes() {
    const raw = process.env.UPLOAD_PENDING_TIMEOUT_MINUTES;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 60;
    }
    return parsed;
  }

  private parseCursor(cursor?: string) {
    if (!cursor) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as {
        createdAt?: string;
        id?: string;
      };

      if (!decoded.createdAt || !decoded.id || !/^\d+$/.test(decoded.id)) {
        throw new Error('invalid cursor');
      }

      const createdAt = new Date(decoded.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error('invalid cursor');
      }

      return {
        createdAt,
        id: decoded.id,
      };
    } catch {
      throw new BadRequestException('invalid cursor');
    }
  }

  private encodeCursor(cursor: { createdAt: string; id: string }) {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64');
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

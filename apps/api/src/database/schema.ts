import {
  bigint,
  boolean,
  char,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const photos = pgTable('photos', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  userId: bigint('user_id', { mode: 'number' }),
  albumId: bigint('album_id', { mode: 'number' }),
  title: varchar('title', { length: 200 }),
  description: text('description'),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  takenAtLocal: timestamp('taken_at_local'),
  timezone: varchar('timezone', { length: 64 }),
  cameraMake: varchar('camera_make', { length: 120 }),
  cameraModel: varchar('camera_model', { length: 120 }),
  lensModel: varchar('lens_model', { length: 120 }),
  width: integer('width'),
  height: integer('height'),
  orientation: integer('orientation'),
  mimeType: varchar('mime_type', { length: 100 }),
  checksumSha256: char('checksum_sha256', { length: 64 }).notNull(),
  visibility: varchar('visibility', { length: 20 }).notNull().default('private'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  exif: jsonb('exif'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const photoAssets = pgTable(
  'photo_assets',
  {
    id: bigint('id', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    photoId: bigint('photo_id', { mode: 'number' })
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    bucket: varchar('bucket', { length: 100 }).notNull(),
    objectKey: varchar('object_key', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    etag: varchar('etag', { length: 200 }),
    isOriginal: boolean('is_original').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    bucketObjectKeyUnique: unique('uq_photo_assets_bucket_object_key').on(
      table.bucket,
      table.objectKey,
    ),
    photoKindUnique: unique('uq_photo_assets_photo_kind').on(
      table.photoId,
      table.kind,
    ),
  }),
);

export const photoLocations = pgTable(
  'photo_locations',
  {
    photoId: bigint('photo_id', { mode: 'number' })
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    point: text('point'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    altitude: doublePrecision('altitude'),
    accuracyMeters: doublePrecision('accuracy_meters'),
    placeId: varchar('place_id', { length: 255 }),
    countryCode: varchar('country_code', { length: 8 }),
    admin1: varchar('admin1', { length: 120 }),
    admin2: varchar('admin2', { length: 120 }),
    locality: varchar('locality', { length: 120 }),
    sublocality: varchar('sublocality', { length: 120 }),
    route: varchar('route', { length: 200 }),
    formattedAddress: text('formatted_address'),
    geocodeProvider: varchar('geocode_provider', { length: 50 }),
    geocodeVersion: varchar('geocode_version', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.photoId], name: 'photo_locations_pkey' }),
  }),
);

export const schema = {
  photos,
  photoAssets,
  photoLocations,
};

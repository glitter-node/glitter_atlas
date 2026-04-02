import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { CreatePhotoUploadInput } from "@glitter-atlas/shared";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import { PhotosService } from "./photos.service";

type QueryResult<T extends Record<string, unknown>> = { rows: T[] };

function createPhotosService(options?: {
  poolQuery?: <T extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ) => Promise<QueryResult<T>>;
  connect?: () => Promise<{
    query: <T extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) => Promise<QueryResult<T>>;
    release: () => void;
  }>;
}) {
  const pool = {
    query: options?.poolQuery ?? (async () => ({ rows: [] })),
    connect:
      options?.connect ??
      (async () => ({
        query: async () => ({ rows: [] }),
        release: () => undefined,
      })),
  };

  const databaseService = { pool } as unknown as DatabaseService;
  const storageService = {
    createUploadUrl: async () => ({
      bucket: "glitter",
      uploadUrl: "https://storage.example/upload",
      expiresInSeconds: 900,
    }),
    getObjectUrl: (objectKey: string) => `https://storage.example/${objectKey}`,
  } as unknown as StorageService;

  return new PhotosService(databaseService, storageService);
}

test("createUpload stores the approved user id and private visibility in photos", async () => {
  const clientQueries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const input: CreatePhotoUploadInput = {
    fileName: "sample.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 128,
    title: "Sample",
  };

  const service = createPhotosService({
    connect: async () => ({
      query: async <T extends Record<string, unknown>>(
        sql: string,
        values?: readonly unknown[],
      ) => {
        clientQueries.push({ sql, values });

        if (sql === "begin" || sql === "commit") {
          return { rows: [] } as unknown as QueryResult<T>;
        }

        if (sql.includes("insert into photos")) {
          return {
            rows: [
              {
                id: "101",
                title: "Sample",
                description: null,
                captured_at: null,
                mime_type: "image/jpeg",
                visibility: "private",
                status: "pending",
                created_at: "2026-04-02T00:00:00.000Z",
                updated_at: "2026-04-02T00:00:00.000Z",
                deleted_at: null,
              },
            ],
          } as unknown as QueryResult<T>;
        }

        if (sql.includes("insert into photo_assets")) {
          return {
            rows: [
              {
                id: "202",
                photo_id: "101",
                kind: "original",
                bucket: "glitter",
                object_key: String(values?.[2] ?? "objects/101"),
                mime_type: "image/jpeg",
                size_bytes: "128",
                width: null,
                height: null,
                etag: null,
                is_original: true,
                created_at: "2026-04-02T00:00:00.000Z",
              },
            ],
          } as unknown as QueryResult<T>;
        }

        throw new Error(`unexpected SQL: ${sql}`);
      },
      release: () => undefined,
    }),
  });

  await service.createUpload(input, { approvedUserId: 77 });

  const photoInsert = clientQueries.find((entry) => entry.sql.includes("insert into photos"));
  assert.ok(photoInsert);
  assert.match(photoInsert?.sql ?? "", /insert into photos .*visibility/i);
  assert.equal(photoInsert?.values?.[0], 77);
  assert.equal(photoInsert?.values?.[6], "private");
});

test("listPhotos returns only the current owner rows regardless of visibility", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) => {
      queries.push({ sql, values });

      if (sql.includes("from photos") && sql.includes("where user_id = $1")) {
        return {
          rows: [
            {
              id: "301",
              title: "Owned private",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "private",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: null,
            },
            {
              id: "302",
              title: "Owned shared",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "shared",
              status: "ready",
              created_at: "2026-04-02T00:01:00.000Z",
              updated_at: "2026-04-02T00:01:00.000Z",
              deleted_at: null,
            },
          ],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_locations")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_assets")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.listPhotos({ approvedUserId: 77 });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.photo.id, "301");
  assert.equal(result.items[1]?.photo.id, "302");
  assert.equal(result.nextCursor, null);
  assert.match(queries[0]?.sql ?? "", /where user_id = \$1\s+and deleted_at is null/i);
  assert.doesNotMatch(queries[0]?.sql ?? "", /visibility =/i);
  assert.deepEqual(queries[0]?.values, [77]);
});

test("listSharedPhotos returns only explicitly shared non-deleted rows", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) => {
      queries.push({ sql, values });

      if (sql.includes("from photos") && sql.includes("where visibility = $1")) {
        return {
          rows: [
            {
              id: "401",
              title: "Shared",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "shared",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: null,
            },
          ],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_locations")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_assets")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.listSharedPhotos();

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.photo.visibility, "shared");
  assert.equal(result.nextCursor, null);
  assert.match(queries[0]?.sql ?? "", /where visibility = \$1\s+and deleted_at is null/i);
  assert.deepEqual(queries[0]?.values, ["shared"]);
});

test("setPhotoVisibility lets the owner mark a photo as shared", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });

      if (sql.includes("select id, user_id, deleted_at") && sql.includes("from photos")) {
        return {
          rows: [{ id: "501", user_id: 77, deleted_at: null }],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("update photos") && sql.includes("set visibility = $2")) {
        return {
          rows: [
            {
              id: "501",
              title: "Owned",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "shared",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: null,
            },
          ],
        } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.setPhotoVisibility("501", "shared", { approvedUserId: 77 });

  assert.equal(result.ok, true);
  assert.equal(result.photoId, "501");
  assert.equal(result.visibility, "shared");
  assert.deepEqual(queries[1]?.values, ["501", "shared", 77]);
});

test("setPhotoVisibility lets the owner mark a photo as private", async () => {
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string) => {
      if (sql.includes("select id, user_id, deleted_at") && sql.includes("from photos")) {
        return {
          rows: [{ id: "502", user_id: 77, deleted_at: null }],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("update photos") && sql.includes("set visibility = $2")) {
        return {
          rows: [
            {
              id: "502",
              title: "Owned",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "private",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: null,
            },
          ],
        } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.setPhotoVisibility("502", "private", { approvedUserId: 77 });

  assert.equal(result.visibility, "private");
});

test("setPhotoVisibility rejects another user's photo", async () => {
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string) => {
      if (sql.includes("select id, user_id, deleted_at") && sql.includes("from photos")) {
        return {
          rows: [{ id: "503", user_id: 88, deleted_at: null }],
        } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  await assert.rejects(
    service.setPhotoVisibility("503", "shared", { approvedUserId: 77 }),
    (error: unknown) => error instanceof ForbiddenException,
  );
});

test("getPhoto allows a non-owner to view a shared photo", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });

      if (sql.includes("from photos") && sql.includes("or visibility = $3")) {
        return {
          rows: [
            {
              id: "601",
              title: "Shared detail",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "shared",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: null,
            },
          ],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_locations")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_assets")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.getPhoto("601", { approvedUserId: 77 });

  assert.equal(result.photo.id, "601");
  assert.equal(result.photo.visibility, "shared");
  assert.deepEqual(queries[0]?.values, ["601", 77, "shared"]);
});

test("getPhoto rejects a private photo for a non-owner", async () => {
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string) => {
      if (sql.includes("from photos") && sql.includes("or visibility = $3")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  await assert.rejects(
    service.getPhoto("602", { approvedUserId: 77 }),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test("deletePhoto soft-deletes an owned shared photo", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) => {
      queries.push({ sql, values });

      if (sql.includes("select id, user_id, deleted_at") && sql.includes("from photos")) {
        return {
          rows: [{ id: "701", user_id: 77, deleted_at: null }],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("update photos") && sql.includes("set deleted_at = now()")) {
        return {
          rows: [{ id: "701" }],
        } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.deletePhoto("701", { approvedUserId: 77 });

  assert.equal(result.ok, true);
  assert.equal(result.photoId, "701");
  assert.equal(result.deleteMode, "soft_delete");
  assert.match(queries[1]?.sql ?? "", /update photos\s+set deleted_at = now\(\)/i);
  assert.deepEqual(queries[1]?.values, ["701", 77]);
  assert.doesNotMatch(queries[1]?.sql ?? "", /delete from photos/i);
});


test("listAdminPhotos applies only explicit admin filters", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(
      sql: string,
      values?: readonly unknown[],
    ) => {
      queries.push({ sql, values });

      if (sql.includes("from photos") && sql.includes("user_id = $1") && sql.includes("visibility = $2")) {
        return {
          rows: [
            {
              id: "801",
              user_id: 88,
              title: "Admin row",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "private",
              status: "ready",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: "2026-04-03T00:00:00.000Z",
            },
          ],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_locations")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_assets")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.listAdminPhotos({
    userId: "88",
    visibility: "private",
    includeDeleted: "true",
    createdFrom: "2026-04-01T00:00:00.000Z",
    createdTo: "2026-04-05T00:00:00.000Z",
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.photo.userId, "88");
  assert.equal(result.items[0]?.photo.deletedAt, "2026-04-03T00:00:00.000Z");
  assert.match(queries[0]?.sql ?? "", /where user_id = \$1\s+and visibility = \$2\s+and created_at >= \$3\s+and created_at <= \$4/i);
  assert.doesNotMatch(queries[0]?.sql ?? "", /deleted_at is null/i);
  assert.deepEqual(queries[0]?.values, [88, "private", new Date("2026-04-01T00:00:00.000Z"), new Date("2026-04-05T00:00:00.000Z")]);
});

test("getAdminPhoto returns a photo regardless of owner or deleted state", async () => {
  const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
  const service = createPhotosService({
    poolQuery: async <T extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });

      if (sql.includes("from photos") && sql.includes("where id = $1")) {
        return {
          rows: [
            {
              id: "802",
              user_id: 99,
              title: "Deleted admin row",
              description: null,
              captured_at: null,
              mime_type: "image/jpeg",
              visibility: "shared",
              status: "abandoned",
              created_at: "2026-04-02T00:00:00.000Z",
              updated_at: "2026-04-02T00:00:00.000Z",
              deleted_at: "2026-04-03T00:00:00.000Z",
            },
          ],
        } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_locations")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      if (sql.includes("from photo_assets")) {
        return { rows: [] } as unknown as QueryResult<T>;
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
  });

  const result = await service.getAdminPhoto("802");

  assert.equal(result.photo.id, "802");
  assert.equal(result.photo.userId, "99");
  assert.equal(result.photo.visibility, "shared");
  assert.equal(result.photo.deletedAt, "2026-04-03T00:00:00.000Z");
  assert.deepEqual(queries[0]?.values, ["802"]);
  assert.doesNotMatch(queries[0]?.sql ?? "", /user_id = \$2|visibility = \$3|deleted_at is null/i);
});

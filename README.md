# GlitterAtlas

## Overview

GlitterAtlas is a `pnpm` monorepo with four packages:

- `apps/web`: minimal Next.js shell
- `apps/api`: NestJS API with Fastify
- `apps/worker`: background cleanup worker
- `packages/shared`: shared TypeScript types

The photo domain is SQL-first and depends on the live PostgreSQL schema. File uploads use presigned S3-compatible URLs. The API serves SEO-related static assets from disk through `ASSETS_ROOT_PATH`.

## Architecture

Upload lifecycle:

1. `POST /photos/uploads` creates a photo row, creates the original asset row, and returns a presigned upload URL.
2. The client uploads the file directly to S3/MinIO.
3. `POST /photos/:id/complete` verifies object existence with `HeadObject`, refreshes asset metadata when available, and marks the photo as `ready`.
4. `GET /photos/:id` and `GET /photos` read the persisted photo, location, and selected asset data.

Worker cleanup behavior:

- The worker polls on an interval.
- Each polling tick runs the same abandoned-upload cleanup logic used by the API.
- Cleanup updates `public.photos.status` from `pending` to `abandoned` for timed-out rows.

Storage integration:

- The API generates presigned S3-compatible upload URLs.
- Completion uses `HeadObject` to verify object existence.
- The server does not proxy file bytes.

## Installation

```bash
pnpm install
```

## Build

Build in this order. The order is required.

```bash
pnpm --filter @glitter-atlas/shared build
pnpm --filter @glitter-atlas/api build
pnpm --filter @glitter-atlas/worker build
```

## Start

Start the built API:

```bash
pnpm --filter @glitter-atlas/api start
```

Start the built worker:

```bash
pnpm --filter @glitter-atlas/worker start
```

## Environment Variables

Required runtime variables:

- `DATABASE_URL`
- `API_HOST`
- `API_PORT`
- `ASSETS_ROOT_PATH`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_PUBLIC_BASE_URL`
- `WORKER_NAME`
- `WORKER_CLEANUP_INTERVAL_MS`
- `WORKER_CLEANUP_BATCH_LIMIT`
- `UPLOAD_PENDING_TIMEOUT_MINUTES`

## Static Assets

The API serves these routes from files under `ASSETS_ROOT_PATH`:

- `/favicon.ico` -> `favicon.ico`
- `/robots.txt` -> `atlas.glitter.kr_robots.txt`
- `/sitemap.xml` -> `atlas.glitter.kr_sitemap.xml`
- `/site.webmanifest` -> `atlas-kr-site.webmanifest`
- `/og/default.png` -> `og-default.png`

## API Flow

- `POST /photos/uploads`
  - Creates upload metadata and returns a presigned upload URL
- `POST /photos/:id/complete`
  - Verifies uploaded object existence and finalizes photo readiness
- `GET /photos/:id`
  - Returns one photo with optional location and selected asset
- `GET /photos`
  - Returns paginated photo results with optional `status` filter

## Pre-Production Checklist

- `pnpm install` completed successfully
- `shared`, `api`, and `worker` builds completed in required order
- `dist` output matches current source
- live PostgreSQL schema matches runtime expectations
- storage credentials and bucket access are valid
- `ASSETS_ROOT_PATH` exists and contains required files
- API port is free before start
- worker polling is running after start
- full upload lifecycle has been verified on the built runtime path

## Constraints

- Do not modify nginx
- Do not use Docker
- Do not rely on the dev runtime for deployment validation
- Do not reintroduce database bootstrap DDL

## Status

Production-transfer ready.

# GlitterAtlas

## Project Overview

GlitterAtlas is a `pnpm` workspace monorepo that contains a user-facing web application, a backend API, a background worker, and a shared package for runtime contracts and types.

The repository is organized so that each runtime application can be built and started independently while still sharing common code through the workspace. The web application is implemented with Next.js, the API uses NestJS, and the worker runs as a separate Node.js process. Shared types and interfaces are provided through `packages/shared`.

## Tech Stack

### Language

- TypeScript
- JavaScript

### Frontend

- Next.js
- React
- Next.js App Router
- Global CSS
- CSS Modules

### Backend

- NestJS
- Fastify

### Database and Storage

- PostgreSQL
- `pg`
- Drizzle ORM
- MinIO object storage with presigned URL-based direct upload

### Email

- Nodemailer

### Background Processing

- Node.js worker process
- NestJS application context

### Package Management and Workspace

- `pnpm`
- `pnpm` workspaces
- workspace-local dependencies via `workspace:*`

### Build and Runtime Tooling

- Node.js
- `next build`
- `next start`
- TypeScript compiler (`tsc`)
- `tsup`
- `tsx`
- `concurrently`

### Linting and Formatting

- ESLint
- Prettier
- `typescript-eslint`
- `eslint-config-next`
- `eslint-config-prettier`

### Testing

- `node:test`
- `node:assert/strict`

## Monorepo Architecture

### Workspace structure

The workspace is defined in `pnpm-workspace.yaml` and includes:

```yaml
packages:
  - apps/*
  - packages/*
```

### Repository layout

```text
.
├── apps
│   ├── api
│   ├── web
│   └── worker
├── packages
│   └── shared
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── eslint.config.mjs
└── .prettierrc.json
```

### `apps/web`

The frontend application.

Key characteristics:

- built with Next.js
- uses the App Router
- contains route-based pages under `app/`
- contains reusable client components under `components/`
- includes route handlers under `app/api/*`
- includes a storage route under `app/storage/*`
- builds into `.next`

### `apps/api`

The backend service.

Key characteristics:

- built with NestJS
- uses Fastify
- compiles into `dist`
- starts with Node.js after compilation
- provides backend logic for authentication, photos, storage integration, admin operations, and email flows

### `apps/worker`

The background worker.

Key characteristics:

- runs as a standalone Node.js process
- compiles into `dist`
- uses NestJS packages and shared workspace code

### `packages/shared`

The shared workspace package.

Key characteristics:

- provides shared runtime contracts, types, and utilities
- builds into `dist`
- is consumed by the web, API, and worker packages through `workspace:*`

## Runtime Model

### Build outputs

Each workspace package has its own build output:

- `apps/web` -> `.next`
- `apps/api` -> `dist`
- `apps/worker` -> `dist`
- `packages/shared` -> `dist`

### How the applications run together

The repository contains three runtime applications:

- Web
- API
- Worker

Their relationship is:

- the web application serves the user-facing interface
- the web application also contains selected route handlers and frontend-side request orchestration
- the API service provides backend endpoints and integrations
- the worker handles background processing separately
- the shared package provides common contracts used across the applications

### Web runtime

The web application is built with:

```bash
pnpm --filter @glitter-atlas/web build
```

and started with:

```bash
pnpm --filter @glitter-atlas/web start
```

The package start script runs:

```bash
next start --hostname 127.0.0.1 --port 4000
```

### API runtime

The API application is built with:

```bash
pnpm --filter @glitter-atlas/api build
```

and started with:

```bash
pnpm --filter @glitter-atlas/api start
```

The package start script runs:

```bash
node dist/main.js
```

### Worker runtime

The worker application is built with:

```bash
pnpm --filter @glitter-atlas/worker build
```

and started with:

```bash
pnpm --filter @glitter-atlas/worker start
```

The package start script runs:

```bash
node dist/worker/src/main.js
```

## Development

### Install dependencies

From the repository root:

```bash
pnpm install
```

### Run the full workspace in development

```bash
pnpm dev
```

### Run only the web application

```bash
pnpm --filter @glitter-atlas/web dev
```

### Run only the API application

```bash
pnpm --filter @glitter-atlas/api dev
```

### Run only the worker application

```bash
pnpm --filter @glitter-atlas/worker dev
```

## Production

### Exact build order

For explicit package-by-package builds, the safe order is:

```bash
pnpm --filter @glitter-atlas/shared build
pnpm --filter @glitter-atlas/web build
pnpm --filter @glitter-atlas/api build
pnpm --filter @glitter-atlas/worker build
```

A full recursive workspace build is also available:

```bash
pnpm build
```

### Exact start commands

Web:

```bash
pnpm --filter @glitter-atlas/web start
```

API:

```bash
pnpm --filter @glitter-atlas/api start
```

Worker:

```bash
pnpm --filter @glitter-atlas/worker start
```

### Process model

This repository provides package-level build and start commands. Process supervision is handled outside the repository.

The important production invariants are:

1. build the correct package output before start
2. start the correct package entrypoint
3. keep the runtime aligned with the current build artifacts

## Static Assets

### Next.js static path

The frontend serves built assets from:

```text
/_next/static/...
```

These files are generated by the Next.js build under:

```text
apps/web/.next/static/...
```

### Build and runtime alignment

A correct production frontend requires alignment between:

- the current `.next` output on disk
- the running `next start` process
- the chunk names referenced in the HTML
- the asset files returned from `/_next/static/...`

If the running app references chunk names that do not exist in the current `.next/static` output, the build and runtime are out of sync.

### Rewrites

`apps/web/next.config.ts` defines rewrites for:

- `/api/:path*`
- selected metadata and asset routes such as favicon, robots, sitemap, manifest, and OG image

These rewrites forward selected requests to an internal API origin defined by environment configuration.

## Troubleshooting

### Stale build

Symptom:

- the application starts, but the frontend does not reflect recent changes

Checks:

```bash
ls -la apps/web/.next
find apps/web/.next/static/chunks -maxdepth 1 -type f | head
```

If `.next` does not reflect the current source state, rebuild the web package before restarting it.

### Build/runtime mismatch

Symptom:

- page HTML loads
- one or more CSS or JavaScript chunks return `404`

Checks:

```bash
curl -s http://127.0.0.1:4000 | grep _next/static | head
find apps/web/.next/static/chunks -maxdepth 1 -type f | head
```

If the live HTML references chunks that do not exist in the current `.next/static/chunks` output, the runtime is stale relative to the latest build.

### Wrong working directory

Symptom:

- the frontend starts, but uses the wrong package context or wrong build output

The intended production web entrypoint is:

```bash
pnpm --filter @glitter-atlas/web start
```

It should be run in a workspace-aware context from the repository root.

### Missing chunk

Symptom:

- document request returns `200`
- asset request under `/_next/static/...` returns `404`

Checks:

```bash
find apps/web/.next/static/chunks -maxdepth 1 -type f | head
curl -I http://127.0.0.1:4000/_next/static/chunks/<chunk-name>
```

If the file exists on disk but the runtime returns `404`, the running web process is not aligned with the current build output.

### Dependency mismatch

Symptom:

- workspace imports fail
- build steps fail unexpectedly
- dependent packages cannot resolve shared output correctly

Checks:

```bash
pnpm install
pnpm --filter @glitter-atlas/shared build
pnpm --filter @glitter-atlas/web build
pnpm --filter @glitter-atlas/api build
pnpm --filter @glitter-atlas/worker build
```

Because the repository uses workspace-local dependencies, installation and build state must remain consistent across packages.

## Command Reference

### Root

```bash
pnpm install
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm build
pnpm lint
pnpm format
```

### Web

```bash
pnpm --filter @glitter-atlas/web dev
pnpm --filter @glitter-atlas/web build
pnpm --filter @glitter-atlas/web start
pnpm --filter @glitter-atlas/web lint
```

### API

```bash
pnpm --filter @glitter-atlas/api dev
pnpm --filter @glitter-atlas/api build
pnpm --filter @glitter-atlas/api start
pnpm --filter @glitter-atlas/api lint
```

### Worker

```bash
pnpm --filter @glitter-atlas/worker dev
pnpm --filter @glitter-atlas/worker build
pnpm --filter @glitter-atlas/worker start
pnpm --filter @glitter-atlas/worker lint
```

### Shared

```bash
pnpm --filter @glitter-atlas/shared dev
pnpm --filter @glitter-atlas/shared build
pnpm --filter @glitter-atlas/shared lint
```

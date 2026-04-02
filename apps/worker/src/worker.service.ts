import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_CLEANUP_BATCH_LIMIT,
  DEFAULT_UPLOAD_PENDING_TIMEOUT_MINUTES,
  MAX_CLEANUP_BATCH_LIMIT,
  PHOTO_STATUS_ABANDONED,
  PHOTO_STATUS_PENDING,
  projectName,
} from '@glitter-atlas/shared';
import { Pool } from 'pg';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pool: Pool | null = null;

  onModuleInit() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    this.pool = new Pool({ connectionString });

    const intervalMs = this.normalizeIntervalMs(
      process.env.WORKER_CLEANUP_INTERVAL_MS,
    );
    const batchLimit = this.normalizeBatchLimit(
      process.env.WORKER_CLEANUP_BATCH_LIMIT,
    );
    const workerName = process.env.WORKER_NAME ?? 'worker';

    this.logger.log(
      JSON.stringify({
        event: 'worker_start',
        worker: workerName,
        project: projectName,
        intervalMs,
        batchLimit,
      }),
    );

    this.timer = setInterval(() => {
      void this.runCleanup(batchLimit);
    }, intervalMs);
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async runCleanup(limit: number) {
    if (this.isRunning) {
      this.logger.log(
        JSON.stringify({
          event: 'cleanup_skip',
          reason: 'run_in_progress',
        }),
      );
      return;
    }

    if (!this.pool) {
      throw new Error('database pool is not initialized');
    }

    this.isRunning = true;

    try {
      const result = await this.cleanupAbandonedUploads(limit);
      this.logger.log(
        JSON.stringify({
          event: 'cleanup_result',
          ...result,
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown cleanup error';
      this.logger.error(
        JSON.stringify({
          event: 'cleanup_error',
          message,
        }),
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async cleanupAbandonedUploads(limit: number) {
    if (!this.pool) {
      throw new Error('database pool is not initialized');
    }

    const timeoutMinutes = this.getUploadPendingTimeoutMinutes();
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const candidateResult = await this.pool.query<{ id: string }>(
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

    const photoIds = candidateResult.rows.map((row: { id: string }) => row.id);

    if (photoIds.length === 0) {
      return {
        scannedCount: 0,
        abandonedCount: 0,
        cutoff: cutoff.toISOString(),
      };
    }

    const updatedResult = await this.pool.query<{ id: string }>(
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

  private normalizeIntervalMs(value?: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 30000;
    }
    return Math.floor(parsed);
  }

  private normalizeBatchLimit(value?: string) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_CLEANUP_BATCH_LIMIT;
    }
    return Math.min(parsed, MAX_CLEANUP_BATCH_LIMIT);
  }

  private getUploadPendingTimeoutMinutes() {
    const parsed = Number(process.env.UPLOAD_PENDING_TIMEOUT_MINUTES);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_UPLOAD_PENDING_TIMEOUT_MINUTES;
    }
    return parsed;
  }
}

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { projectName } from '@glitter-atlas/shared';
import { PhotosService } from '../../api/src/photos/photos.service';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(PhotosService)
    private readonly photosService: PhotosService,
  ) {}

  onModuleInit() {
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

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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

    this.isRunning = true;

    try {
      const result = await this.photosService.cleanupAbandonedUploads({ limit });
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

  private normalizeIntervalMs(value?: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 30000;
    }
    return Math.floor(parsed);
  }

  private normalizeBatchLimit(value?: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 100;
    }
    return Math.min(Math.floor(parsed), 1000);
  }
}

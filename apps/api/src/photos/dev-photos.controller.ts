import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { GetPhotoResponse } from '@glitter-atlas/shared';
import { PhotosService } from './photos.service';

@Controller('dev/photos')
export class DevPhotosController {
  constructor(
    @Inject(PhotosService)
    private readonly photosService: PhotosService,
  ) {}

  @Get()
  listPhotos(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
  ): Promise<{
    items: GetPhotoResponse[];
    nextCursor: string | null;
  }> {
    return this.photosService.listPhotos({
      limit,
      cursor,
      status,
    });
  }
}

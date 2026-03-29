import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CleanupAbandonedUploadsInput,
  CleanupAbandonedUploadsResponse,
  CompletePhotoUploadInput,
  CompletePhotoUploadResponse,
  CreatePhotoUploadInput,
  CreatePhotoUploadResponse,
  GetPhotoResponse,
} from '@glitter-atlas/shared';
import { RequireAuthAccess } from '../auth/auth-access.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { PhotosService } from './photos.service';

@Controller('photos')
export class PhotosController {
  constructor(
    @Inject(PhotosService)
    private readonly photosService: PhotosService,
  ) {}

  @Post('uploads')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('approved')
  createUpload(
    @Body() body: CreatePhotoUploadInput,
  ): Promise<CreatePhotoUploadResponse> {
    return this.photosService.createUpload(body);
  }

  @Post('cleanup/abandoned')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('super_admin')
  cleanupAbandoned(
    @Body() body?: CleanupAbandonedUploadsInput,
  ): Promise<CleanupAbandonedUploadsResponse> {
    return this.photosService.cleanupAbandonedUploads(body);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @RequireAuthAccess('approved')
  completeUpload(
    @Param('id') id: string,
    @Body() body: CompletePhotoUploadInput,
  ): Promise<CompletePhotoUploadResponse> {
    const photoId = this.normalizePhotoId(id);
    const objectKey = body?.objectKey?.trim();

    if (!objectKey) {
      throw new BadRequestException('objectKey is required');
    }

    return this.photosService.completeUpload(photoId, { objectKey });
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('approved')
  getPhoto(@Param('id') id: string): Promise<GetPhotoResponse> {
    return this.photosService.getPhoto(this.normalizePhotoId(id));
  }

  @Get()
  @UseGuards(AuthGuard)
  @RequireAuthAccess('approved')
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

  private normalizePhotoId(id: string) {
    const value = id?.trim();

    if (!value || !/^\d+$/.test(value)) {
      throw new BadRequestException('invalid photo id');
    }

    return value;
  }
}

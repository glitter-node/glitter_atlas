import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequireAuthAccess } from '../auth/auth-access.decorator';
import { AuthGuard } from '../auth/auth.guard';
import { PhotosService } from './photos.service';

@Controller('admin/photos')
export class AdminPhotosController {
  constructor(
    @Inject(PhotosService)
    private readonly photosService: PhotosService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @RequireAuthAccess('super_admin')
  listPhotos(
    @Query('user_id') userId?: string,
    @Query('visibility') visibility?: string,
    @Query('include_deleted') includeDeleted?: string,
    @Query('created_from') createdFrom?: string,
    @Query('created_to') createdTo?: string,
  ) {
    return this.photosService.listAdminPhotos({
      userId,
      visibility,
      includeDeleted,
      createdFrom,
      createdTo,
    });
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @RequireAuthAccess('super_admin')
  getPhoto(@Param('id') id: string) {
    return this.photosService.getAdminPhoto(this.normalizePhotoId(id));
  }

  private normalizePhotoId(id: string) {
    const value = id?.trim();

    if (!value || /^\d+$/.test(value) === false) {
      throw new BadRequestException('invalid photo id');
    }

    return value;
  }
}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminPhotosController } from './admin-photos.controller';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [AuthModule],
  controllers: [PhotosController, AdminPhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevPhotosController } from './dev-photos.controller';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [AuthModule],
  controllers: [PhotosController, DevPhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}

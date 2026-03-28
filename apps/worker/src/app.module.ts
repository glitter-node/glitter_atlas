import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../api/src/database/database.module';
import { PhotosModule } from '../../api/src/photos/photos.module';
import { StorageModule } from '../../api/src/storage/storage.module';
import { WorkerService } from './worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    StorageModule,
    PhotosModule,
  ],
  providers: [WorkerService],
})
export class AppModule {}

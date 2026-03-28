import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsController } from './assets.controller';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { PhotosModule } from './photos/photos.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    StorageModule,
    PhotosModule,
  ],
  controllers: [AppController, AssetsController],
})
export class AppModule {}

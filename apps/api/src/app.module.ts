import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AssetsController } from './assets.controller';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { MailController } from './mail/mail.controller';
import { MailService } from './mail/mail.service';
import { PhotosModule } from './photos/photos.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    AuthModule,
    DatabaseModule,
    StorageModule,
    PhotosModule,
  ],
  controllers: [AppController, AssetsController, MailController],
  providers: [MailService],
})
export class AppModule {}

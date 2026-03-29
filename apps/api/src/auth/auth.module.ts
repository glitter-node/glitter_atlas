import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { MailService } from '../mail/mail.service';
import { AuthGuard } from './auth.guard';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, MailService, AuthBootstrapService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}

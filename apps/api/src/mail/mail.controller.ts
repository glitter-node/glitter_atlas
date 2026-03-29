import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(
    @Inject(MailService)
    private readonly mailService: MailService,
  ) {}

  @Post('test')
  @HttpCode(200)
  async sendTestEmail(@Body() body: { to?: string }) {
    const to = body?.to?.trim();

    if (!to) {
      throw new BadRequestException('to is required');
    }

    await this.mailService.sendTestEmail(to);
    return { ok: true };
  }
}

import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

type MailInput = {
  to: string;
  subject: string;
  text: string;
};

@Injectable()
export class MailService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    console.log('[api] MailService.constructor');
  }

  async sendMail(input: MailInput) {
    const host = this.configService.getOrThrow<string>('MAIL_HOST');
    const port = Number(this.configService.getOrThrow<string>('MAIL_PORT'));
    const username = this.configService.getOrThrow<string>('MAIL_USERNAME');
    const password = this.configService.getOrThrow<string>('MAIL_PASSWORD');
    const encryption = (
      this.configService.get<string>('MAIL_ENCRYPTION') ?? ''
    ).trim().toLowerCase();
    const fromAddress = this.configService.getOrThrow<string>('MAIL_FROM_ADDRESS');
    const fromName = this.configService.get<string>('MAIL_FROM_NAME')?.trim();
    const secure = encryption === 'ssl';
    const requireTLS = encryption === 'tls' || encryption === 'starttls';

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS,
      auth: {
        user: username,
        pass: password,
      },
    });

    try {
      await transporter.sendMail({
        from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'SMTP send failed';
      throw new InternalServerErrorException(message);
    }
  }

  async sendTestEmail(to: string) {
    await this.sendMail({
      to,
      subject: 'GlitterAtlas Test Mail',
      text: 'SMTP configuration is working.',
    });
  }
}

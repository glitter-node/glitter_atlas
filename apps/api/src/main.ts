import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (request, reply, payload) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '0');
      reply.header('Referrer-Policy', 'no-referrer');

      if (request.protocol === 'https') {
        reply.header(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
      }

      return payload;
    });

  const host = process.env.API_HOST ?? '127.0.0.1';
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, host);
}

bootstrap();

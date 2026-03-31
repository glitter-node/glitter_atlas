import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[api] bootstrap start');
  console.log('[api] before NestFactory.create');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  console.log('[api] after NestFactory.create');

  console.log('[api] before addHook');
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
  console.log('[api] after addHook');

  const host = '127.0.0.1';
  const port = 4100;
  console.log(`[api] before listen http://${host}:${port}`);
  await app.listen({ host, port });
  console.log(`[api] after listen http://${host}:${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('[api] bootstrap failed', error);
  process.exit(1);
});

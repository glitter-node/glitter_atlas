import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const endpoint = process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const region = process.env.S3_REGION ?? 'us-east-1';
const bucket = process.env.S3_BUCKET ?? 'glitter';
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;

const client =
  accessKeyId && secretAccessKey
    ? new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    : null;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ objectKey?: string[] }> },
) {
  if (!client) {
    return new Response('storage credentials are not configured', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const { objectKey } = await context.params;
  const key = objectKey?.join('/');

  if (!key) {
    return new Response('object key is required', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!(result.Body instanceof Readable)) {
      return new Response('object stream is unavailable', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    const headers = new Headers();

    if (result.ContentType) {
      headers.set('Content-Type', result.ContentType);
    }

    if (typeof result.ContentLength === 'number') {
      headers.set('Content-Length', String(result.ContentLength));
    }

    if (result.ETag) {
      headers.set('ETag', result.ETag);
    }

    headers.set('Cache-Control', 'public, max-age=3600');

    const chunks: Buffer[] = [];

    for await (const chunk of result.Body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);

    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response('object not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}

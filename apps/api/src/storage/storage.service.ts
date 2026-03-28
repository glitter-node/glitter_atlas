import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class StorageIntegrationError extends Error {
  constructor(message = 'storage integration failure') {
    super(message);
    this.name = 'StorageIntegrationError';
  }
}

@Injectable()
export class StorageService implements OnModuleInit {
  private client!: S3Client;
  private bucket!: string;
  private publicBaseUrl!: string | null;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
  }

  onModuleInit() {
    const endpoint = this.configService.getOrThrow<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION') ?? 'us-east-1';

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });

    this.bucket = this.configService.getOrThrow<string>('S3_BUCKET');
    this.publicBaseUrl = this.configService.get<string>('S3_PUBLIC_BASE_URL') ?? null;
  }

  async createUploadUrl(params: { objectKey: string; mimeType: string }) {
    const expiresInSeconds = 900;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      ContentType: params.mimeType,
    });

    return {
      bucket: this.bucket,
      expiresInSeconds,
      uploadUrl: await getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
      }),
    };
  }

  async verifyObjectExists(bucket: string, key: string) {
    const metadata = await this.getObjectMetadata(bucket, key);
    return metadata.exists;
  }

  async getObjectMetadata(bucket: string, key: string) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      return {
        exists: true,
        etag: result.ETag ? result.ETag.replace(/^"(.*)"$/, '$1') : null,
        sizeBytes:
          typeof result.ContentLength === 'number' ? result.ContentLength : null,
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404
      ) {
        return {
          exists: false,
          etag: null,
          sizeBytes: null,
        };
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error.name === 'NotFound' || error.name === 'NoSuchKey')
      ) {
        return {
          exists: false,
          etag: null,
          sizeBytes: null,
        };
      }
      throw new StorageIntegrationError();
    }
  }

  getObjectUrl(objectKey: string) {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${objectKey}`;
    }

    const endpoint = this.configService.getOrThrow<string>('S3_ENDPOINT').replace(
      /\/$/,
      '',
    );
    return `${endpoint}/${this.bucket}/${objectKey}`;
  }
}

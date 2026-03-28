import { Controller, Get, Inject, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

type AssetRouteKey =
  | 'favicon'
  | 'robots'
  | 'sitemap'
  | 'manifest'
  | 'ogDefault';

@Controller()
export class AssetsController {
  private readonly assetsRootPath: string;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {
    this.assetsRootPath = this.configService.getOrThrow<string>('ASSETS_ROOT_PATH');
  }

  @Get('favicon.ico')
  async getFavicon(@Res() reply: { header: Function; type: Function; send: Function }) {
    return this.sendAsset(reply, 'favicon');
  }

  @Get('robots.txt')
  async getRobots(@Res() reply: { header: Function; type: Function; send: Function }) {
    return this.sendAsset(reply, 'robots');
  }

  @Get('sitemap.xml')
  async getSitemap(@Res() reply: { header: Function; type: Function; send: Function }) {
    return this.sendAsset(reply, 'sitemap');
  }

  @Get('site.webmanifest')
  async getSiteWebmanifest(@Res() reply: { header: Function; type: Function; send: Function }) {
    return this.sendAsset(reply, 'manifest');
  }

  @Get('og/default.png')
  async getOgDefault(@Res() reply: { header: Function; type: Function; send: Function }) {
    return this.sendAsset(reply, 'ogDefault');
  }

  private async sendAsset(
    reply: { header: Function; type: Function; send: Function },
    assetKey: AssetRouteKey,
  ) {
    const asset = this.getAssetDefinition(assetKey);
    const assetPath = join(this.assetsRootPath, asset.fileName);

    try {
      await access(assetPath);
    } catch {
      throw new NotFoundException('asset not found');
    }

    reply.header('Cache-Control', asset.cacheControl);
    reply.type(asset.contentType);
    return reply.send(createReadStream(assetPath));
  }

  private getAssetDefinition(assetKey: AssetRouteKey) {
    switch (assetKey) {
      case 'favicon':
        return {
          fileName: 'favicon.ico',
          contentType: 'image/x-icon',
          cacheControl: 'public, max-age=31536000, immutable',
        };
      case 'robots':
        return {
          fileName: 'atlas.glitter.kr_robots.txt',
          contentType: 'text/plain; charset=utf-8',
          cacheControl: 'no-cache',
        };
      case 'sitemap':
        return {
          fileName: 'atlas.glitter.kr_sitemap.xml',
          contentType: 'application/xml; charset=utf-8',
          cacheControl: 'public, max-age=3600',
        };
      case 'manifest':
        return {
          fileName: 'atlas-kr-site.webmanifest',
          contentType: 'application/manifest+json; charset=utf-8',
          cacheControl: 'public, max-age=31536000, immutable',
        };
      case 'ogDefault':
        return {
          fileName: 'og-default.png',
          contentType: 'image/png',
          cacheControl: 'public, max-age=31536000, immutable',
        };
    }
  }
}

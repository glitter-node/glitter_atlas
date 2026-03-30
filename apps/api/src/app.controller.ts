import { Controller, Get } from '@nestjs/common';
import { projectName } from '@glitter-atlas/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const startedAt = new Date().toISOString();

function readVersion() {
  const envVersion = process.env.npm_package_version?.trim();

  if (envVersion) {
    return envVersion;
  }

  const packageJsonPath = join(process.cwd(), 'package.json');

  if (!existsSync(packageJsonPath)) {
    return 'unknown';
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version?: string;
    };

    return packageJson.version?.trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: projectName,
      service: 'api',
      status: 'ok',
      uploadEndpoint: '/photos/uploads',
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      appName: 'atlas-api',
      pid: process.pid,
      cwd: process.cwd(),
      uptime: Number(process.uptime().toFixed(2)),
      startedAt,
      version: readVersion(),
    };
  }
}

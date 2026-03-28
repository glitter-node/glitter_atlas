import { Controller, Get } from '@nestjs/common';
import { projectName } from '@glitter-atlas/shared';

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
}

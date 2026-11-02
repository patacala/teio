import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { DemoService } from './demo.service';
import { DemoReadyDto } from './demo.dto';

@Controller({ path: 'webhooks', version: '1' })
export class DemoWebhookController {
  constructor(private readonly demoService: DemoService) {}

  @Public()
  @Post('demo-ready')
  @HttpCode(HttpStatus.OK)
  async demoReady(@Body() dto: DemoReadyDto) {
    await this.demoService.handleDemoReady(dto);
    return { received: true };
  }
}

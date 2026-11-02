import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ConversationManagementService } from './conversation-management.service';
import { IngestMessageDto } from './ingest-message.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'messages', version: '1' })
export class IngestController {
  constructor(private readonly conversationService: ConversationManagementService) {}

  @Public()
  @Post('incoming')
  @HttpCode(HttpStatus.CREATED)
  ingestMessage(@Body() dto: IngestMessageDto) {
    return this.conversationService.ingestMessage(dto);
  }
}

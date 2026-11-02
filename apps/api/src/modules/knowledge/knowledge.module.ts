import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { KnowledgeEntryEntity } from './knowledge-entry.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { FileExtractionService } from './file-extraction.service';
import { AIAgentsModule } from '../ai-agents/ai-agents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeEntryEntity]),
    AIAgentsModule,
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }), // 10MB, matches FileExtractionService
  ],
  providers: [KnowledgeService, FileExtractionService],
  controllers: [KnowledgeController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}

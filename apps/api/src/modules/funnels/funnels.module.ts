import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelEntity } from './funnel.entity';
import { FunnelStageEntity } from './funnel-stage.entity';
import { FunnelTemplateEntity } from './funnel-template.entity';
import { FunnelTemplateStageEntity } from './funnel-template-stage.entity';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FunnelEntity,
      FunnelStageEntity,
      FunnelTemplateEntity,
      FunnelTemplateStageEntity,
    ]),
  ],
  providers: [FunnelsService],
  controllers: [FunnelsController],
  exports: [FunnelsService],
})
export class FunnelsModule {}

import { Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailModule as InfrastructureMailModule } from '../../infrastructure/mail/mail.module';

@Module({
  imports: [InfrastructureMailModule],
  controllers: [MailController],
})
export class MailModule {}

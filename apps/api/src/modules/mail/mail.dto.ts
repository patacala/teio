import { IsString, IsEmail, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MailAttachmentDto {
  @IsString()
  filename: string;

  @IsString()
  content: string; // base64-encoded

  @IsString()
  @IsOptional()
  contentType?: string;
}

export class SendMailWithHtmlDto {
  @IsEmail()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  html: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  @IsOptional()
  attachments?: MailAttachmentDto[];
}

export class SendMailWithTemplateDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  templateId: string;

  @IsObject()
  @IsOptional()
  variables?: Record<string, string>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailAttachmentDto)
  @IsOptional()
  attachments?: MailAttachmentDto[];
}

import { IsUUID, IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class ExecuteToolDto {
  @IsUUID()
  agent_id: string;

  @IsString()
  @IsNotEmpty()
  tool: string;

  @IsObject()
  input: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  conversation_id?: string;
}

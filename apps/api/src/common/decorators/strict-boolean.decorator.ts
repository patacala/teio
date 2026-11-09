import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * @IsBoolean() for request bodies. The global ValidationPipe uses implicit
 * conversion, which turns any non-empty string (including "false") into
 * `true` before validation; this validates the value as the client sent it.
 */
export const StrictBoolean = () =>
  applyDecorators(
    Transform(({ obj, key }) => (obj as Record<string, unknown>)[key]),
    IsBoolean(),
  );

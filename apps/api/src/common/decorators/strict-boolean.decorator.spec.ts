/// <reference types="jest" />
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { StrictBoolean } from './strict-boolean.decorator';
import { UpdateUserDto } from '../../modules/users/dto/update-user.dto';

class LooseDto {
  @IsOptional()
  @IsBoolean()
  flag?: boolean;
}

class StrictDto {
  @IsOptional()
  @StrictBoolean()
  flag?: boolean;
}

// Same options as main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const validate = (metatype: new () => object, value: unknown) =>
  pipe.transform(value, { type: 'body', metatype });

describe('StrictBoolean', () => {
  it('documents the problem: plain @IsBoolean turns "false" into true', async () => {
    await expect(validate(LooseDto, { flag: 'false' })).resolves.toEqual({ flag: true });
  });

  it.each(['false', 'true', 'yes', 1, 0, {}])('rejects the non-boolean %p', async (flag) => {
    await expect(validate(StrictDto, { flag })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([true, false])('accepts the real boolean %p unchanged', async (flag) => {
    await expect(validate(StrictDto, { flag })).resolves.toEqual({ flag });
  });

  it('keeps optional booleans optional', async () => {
    await expect(validate(StrictDto, {})).resolves.toEqual({});
  });

  it('protects user deactivation from string coercion', async () => {
    await expect(validate(UpdateUserDto, { is_active: 'false' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validate(UpdateUserDto, { is_active: false })).resolves.toMatchObject({ is_active: false });
  });
});

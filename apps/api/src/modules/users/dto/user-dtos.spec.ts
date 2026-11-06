/// <reference types="jest" />
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { InviteUserDto } from './invite-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { CreateUserDto } from './create-user.dto';
import { AcceptInviteDto } from './accept-invite.dto';

// Same options as the global pipe in main.ts
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function validate(metatype: ArgumentMetadata['metatype'], body: Record<string, unknown>) {
  try {
    return { value: await pipe.transform(body, { type: 'body', metatype }), messages: [] as string[] };
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return { value: undefined, messages: (err.getResponse() as { message: string[] }).message };
  }
}

describe('InviteUserDto', () => {
  it.each(['admin', 'agent'])('accepts role %s and normalizes the email', async (role) => {
    const { value, messages } = await validate(InviteUserDto, { email: ' Jane@Example.COM ', role });
    expect(messages).toEqual([]);
    expect(value.email).toBe('jane@example.com');
  });

  it('rejects an invalid email', async () => {
    const { messages } = await validate(InviteUserDto, { email: 'not-an-email', role: 'agent' });
    expect(messages).toEqual(['email must be an email']);
  });

  it.each(['owner', 'viewer', 'superadmin', undefined])('rejects role %p', async (role) => {
    const { messages } = await validate(InviteUserDto, { email: 'jane@example.com', role });
    expect(messages).toEqual(['role must be one of the following values: admin, agent']);
  });
});

describe('UpdateUserDto', () => {
  it.each([
    [{ role: 'agent' }],
    [{ role: 'admin' }],
    [{ is_active: false }],
    [{ full_name: 'Jane' }],
  ])('accepts the fields the Team page sends: %j', async (body) => {
    const { messages } = await validate(UpdateUserDto, body);
    expect(messages).toEqual([]);
  });

  it.each([
    ['is_platform_admin', { is_platform_admin: true }, 'property is_platform_admin should not exist'],
    ['organization_id', { organization_id: 'other-org' }, 'property organization_id should not exist'],
    ['auth_user_id', { auth_user_id: 'someone-else' }, 'property auth_user_id should not exist'],
    ['email', { email: 'x@y.z' }, 'property email should not exist'],
  ])('rejects attempts to set %s', async (_field, body, message) => {
    const { messages } = await validate(UpdateUserDto, body);
    expect(messages).toContain(message);
  });

  it.each(['owner', 'viewer', 'root'])('rejects assigning role %s', async (role) => {
    const { messages } = await validate(UpdateUserDto, { role });
    expect(messages).toEqual(['role must be one of the following values: admin, agent']);
  });
});

describe('CreateUserDto', () => {
  it('rejects is_platform_admin and non-assignable roles', async () => {
    const { messages } = await validate(CreateUserDto, {
      email: 'a@b.co',
      full_name: 'A',
      role: 'owner',
      is_platform_admin: true,
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        'property is_platform_admin should not exist',
        'role must be one of the following values: admin, agent',
      ]),
    );
  });
});

describe('AcceptInviteDto', () => {
  it('accepts an empty body and trims the name', async () => {
    expect((await validate(AcceptInviteDto, {})).messages).toEqual([]);
    expect((await validate(AcceptInviteDto, { full_name: '  Jane  ' })).value.full_name).toBe('Jane');
  });

  it('rejects role or org changes smuggled into the accept call', async () => {
    const { messages } = await validate(AcceptInviteDto, { role: 'admin', organization_id: 'x' });
    expect(messages).toEqual(
      expect.arrayContaining(['property role should not exist', 'property organization_id should not exist']),
    );
  });
});

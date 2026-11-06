import { Controller, Get, Post, Patch, Body, Param, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@crm/shared';
import type { TenantContext } from '@crm/shared';

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('me')
  getMe(@Req() req: Request, @CurrentTenant() tenant: TenantContext) {
    // Platform admins may be impersonating another org, so look up by ID only
    if (req.user?.is_platform_admin) {
      return this.service.findByIdUnscoped(tenant.user_id);
    }
    return this.service.findById(tenant.user_id, tenant.organization_id);
  }

  @Get()
  findAll(@CurrentTenant() tenant: TenantContext) {
    return this.service.findAllByOrg(tenant.organization_id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Post('invite/accept')
  @Roles(...Object.values(UserRole))
  acceptInvite(@Body() dto: AcceptInviteDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.acceptInvite(tenant.user_id, tenant.organization_id, dto);
  }

  @Post('invite')
  @Roles(UserRole.ADMIN)
  invite(@Body() dto: InviteUserDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.invite(tenant.organization_id, tenant.user_id, dto);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentTenant() tenant: TenantContext) {
    return this.service.create(tenant.organization_id, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }
}

import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import {
  KnowledgeService,
  CreateKnowledgeEntryDto,
  UpdateKnowledgeEntryDto,
  KnowledgeListQuery,
} from './knowledge.service';
import { FileExtractionService } from './file-extraction.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import type { TenantContext } from '@crm/shared';

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller({ path: 'knowledge', version: '1' })
export class KnowledgeController {
  constructor(
    private readonly service: KnowledgeService,
    private readonly extraction: FileExtractionService,
  ) {}

  // STATIC ROUTES FIRST — must precede /:id to avoid param conflicts

  @Get('metrics')
  getMetrics(@CurrentTenant() tenant: TenantContext) {
    return this.service.getMetrics(tenant.organization_id);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string | undefined,
    @Body('title') title: string | undefined,
    @CurrentTenant() tenant: TenantContext,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const content = await this.extraction.extractText(file);
    return this.service.create(tenant.organization_id, {
      title: title?.trim() || this.extraction.titleFromFilename(file.originalname),
      content,
      category: category || 'general',
    });
  }

  @Get('search')
  search(
    @Query('q') q: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.search(tenant.organization_id, q ?? '');
  }

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  reindex(@CurrentTenant() tenant: TenantContext) {
    return this.service.reindex(tenant.organization_id);
  }

  // COLLECTION ROUTES

  @Get()
  findAll(
    @Query() query: KnowledgeListQuery,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findAll(tenant.organization_id, query);
  }

  @Post()
  create(
    @Body() dto: CreateKnowledgeEntryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.create(tenant.organization_id, dto);
  }

  // PARAM ROUTES LAST

  @Get(':id')
  findById(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.findById(id, tenant.organization_id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeEntryDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.update(id, tenant.organization_id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.delete(id, tenant.organization_id);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  toggle(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.toggle(id, tenant.organization_id);
  }
}

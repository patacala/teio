import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { buildPaginationMeta } from '@crm/shared';

export interface CreateCompanyDto {
  name: string;
  company_type?: string;
  domain?: string;
  industry?: string;
  size?: string;
  website?: string;
  website_screenshot?: string;
  logo?: string;
  demo_link?: string;
  company_context?: string;
  phone?: string;
  address?: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCompanyDto extends Partial<CreateCompanyDto> {}

export interface CompanyListParams {
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companyRepo: Repository<CompanyEntity>,
  ) {}

  async findAll(
    organizationId: string,
    params: CompanyListParams = {},
  ): Promise<{ items: CompanyEntity[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.companyRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId });

    if (params.search) {
      qb.andWhere('c.name ILIKE :q', { q: `%${params.search}%` });
    }

    qb.orderBy('c.created_at', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  async findById(id: string, organizationId: string): Promise<CompanyEntity> {
    const company = await this.companyRepo.findOne({
      where: { id, organization_id: organizationId },
    });
    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  async findOrCreate(
    organizationId: string,
    dto: Pick<CreateCompanyDto, 'name' | 'company_type' | 'website' | 'logo' | 'demo_link' | 'company_context'>,
  ): Promise<CompanyEntity> {
    const existing = await this.companyRepo
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: organizationId })
      .andWhere('c.name ILIKE :name', { name: dto.name })
      .getOne();

    if (existing) return existing;

    return this.companyRepo.save(
      this.companyRepo.create({ organization_id: organizationId, ...dto }),
    );
  }

  async create(organizationId: string, dto: CreateCompanyDto): Promise<CompanyEntity> {
    const company = this.companyRepo.create({ organization_id: organizationId, ...dto });
    return this.companyRepo.save(company);
  }

  async update(id: string, organizationId: string, dto: UpdateCompanyDto): Promise<CompanyEntity> {
    const company = await this.findById(id, organizationId);
    Object.assign(company, dto);
    return this.companyRepo.save(company);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    await this.findById(id, organizationId);
    await this.companyRepo.delete({ id, organization_id: organizationId });
  }
}

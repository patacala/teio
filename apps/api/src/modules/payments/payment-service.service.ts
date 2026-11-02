import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentServiceEntity } from './entities/payment-service.entity';
import type { CreatePaymentServiceDto, UpdatePaymentServiceDto } from './dto/payment-service.dto';

@Injectable()
export class PaymentServiceService {
  constructor(
    @InjectRepository(PaymentServiceEntity)
    private readonly serviceRepo: Repository<PaymentServiceEntity>,
  ) {}

  async findAll(organizationId: string, activeOnly = false): Promise<PaymentServiceEntity[]> {
    return this.serviceRepo.find({
      where: activeOnly ? { organization_id: organizationId, is_active: true } : { organization_id: organizationId },
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string, organizationId: string): Promise<PaymentServiceEntity> {
    const service = await this.serviceRepo.findOne({ where: { id, organization_id: organizationId } });
    if (!service) throw new NotFoundException(`Payment service ${id} not found`);
    return service;
  }

  async create(organizationId: string, dto: CreatePaymentServiceDto): Promise<PaymentServiceEntity> {
    const service = this.serviceRepo.create({
      organization_id: organizationId,
      name: dto.name,
      description: dto.description ?? null,
      amount: dto.amount,
      is_active: dto.is_active ?? true,
    });
    return this.serviceRepo.save(service);
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdatePaymentServiceDto,
  ): Promise<PaymentServiceEntity> {
    const service = await this.findById(id, organizationId);
    Object.assign(service, dto);
    return this.serviceRepo.save(service);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const service = await this.findById(id, organizationId);
    await this.serviceRepo.remove(service);
  }
}
